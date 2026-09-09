#!/bin/bash

# termux cant run vitest (Signal 9, phantom killing).
# so use circleci alternative, runs full test suite by creating temp branch,
# then fetch JUnit results back to ci-results/ locally.

# push to temp branch > circleci tests > download junit > cleanup

set -e
cd "$(dirname "$0")/.."

KEEP_BRANCH=false
POLL=true
for arg in "$@"; do
  case $arg in
    --keep) KEEP_BRANCH=true ;;
    --no-poll) POLL=false ;;
  esac
done

if [ -z "$CIRCLECI_TOKEN" ]; then
  echo "error: CIRCLECI_TOKEN not set"
  exit 1
fi

# circleci standalone project slug (found via /me/collaborations)
PROJECT_SLUG="circleci/9BjBRRbsXUjJueU2cq7uGg/YU36DWYQs3RevrR3a2o1CN"
ORG_SLUG="circleci/9BjBRRbsXUjJueU2cq7uGg"

ARTIFACT_DIR="$(pwd)/ci-results"
mkdir -p "$ARTIFACT_DIR"

api() { curl --noproxy '*' -s -H "Circle-Token: $CIRCLECI_TOKEN" "$1"; }

cleanup_branch() {
  echo "cleaning up branch: $1"
  git push origin --delete "$1" 2>/dev/null || true
  git branch -D "$1" 2>/dev/null || true
}

BRANCH="ci-test/$(date +%Y%m%d-%H%M%S)"
ORIG_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "branch: $BRANCH (from $ORIG_BRANCH)"

# commit all local changes to temp branch without losing them
git stash --include-untracked -q 2>/dev/null || true
git checkout -b "$BRANCH"
git stash pop -q 2>/dev/null || true
git add -A
git commit -m "ci-test: ephemeral" --no-verify --allow-empty

echo "pushing..."
PUSH_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
git push -u origin "$BRANCH" --no-verify 2>&1 | tail -3

# go back — restore working tree
git checkout "$ORIG_BRANCH" 2>/dev/null
git cherry-pick --no-commit "$BRANCH" 2>/dev/null || true
git reset HEAD 2>/dev/null || true

[ "$POLL" = false ] && { echo "check: https://app.circleci.com/pipelines/$ORG?branch=$BRANCH"; exit 0; }

echo "waiting for pipeline (2 min)..."
PIPELINE_ID=""
for _ in $(seq 1 60); do
  # only match pipelines created AFTER our push
  PIPELINE_ID=$(api "https://circleci.com/api/v2/pipeline?org-slug=$ORG_SLUG" \
    | jq -r --arg ts "$PUSH_TIME" '[.items[] | select(.created_at > $ts)][0].id // empty' 2>/dev/null)
  [ -n "$PIPELINE_ID" ] && [ "$PIPELINE_ID" != "null" ] && break
  sleep 2
done

if [ -z "$PIPELINE_ID" ] || [ "$PIPELINE_ID" = "null" ]; then
  echo "⏳ no pipeline yet — circleci may still be processing."
  echo "   check: https://app.circleci.com/pipelines/$ORG_SLUG"
  echo "   branch kept: $BRANCH (run 'git push origin --delete $BRANCH' to cleanup)"
  exit 0
fi

echo "pipeline: $PIPELINE_ID"

# poll workflow
while true; do
  WF=$(api "https://circleci.com/api/v2/pipeline/$PIPELINE_ID/workflow")
  WF_ID=$(echo "$WF" | jq -r '.items[0].id // empty')
  STATUS=$(echo "$WF" | jq -r '.items[0].status // "pending"')
  case "$STATUS" in
    success|failed|error|canceled) break ;;
    *) printf "  %s...\r" "$STATUS"; sleep 10 ;;
  esac
done

echo ""
[ "$STATUS" = "success" ] && echo "✅ passed" || echo "❌ failed ($STATUS)"

# download artifacts
if [ -n "$WF_ID" ] && [ "$WF_ID" != "null" ]; then
  JOBS=$(api "https://circleci.com/api/v2/workflow/$WF_ID/job")
  for jn in $(echo "$JOBS" | jq -r '.items[] | select(.job_number != null) | .job_number'); do
    JOB_NAME=$(echo "$JOBS" | jq -r ".items[] | select(.job_number == $jn) | .name")
    JOB_STATUS=$(echo "$JOBS" | jq -r ".items[] | select(.job_number == $jn) | .status")
    echo "  $JOB_NAME: $JOB_STATUS"

    # fetch test results
    TESTS=$(api "https://circleci.com/api/v2/project/$PROJECT_SLUG/$jn/tests")
    TOTAL=$(echo "$TESTS" | jq '.items | length')
    FAILED=$(echo "$TESTS" | jq '[.items[] | select(.result == "failure")] | length')
    echo "    tests: $TOTAL | failed: $FAILED"

    if [ "$FAILED" -gt 0 ] 2>/dev/null; then
      echo "    failures:"
      echo "$TESTS" | jq -r '.items[] | select(.result == "failure") | "      ✗ \(.name)"'
    fi

    # save test results as json
    echo "$TESTS" | jq '.' > "$ARTIFACT_DIR/${JOB_NAME}-tests.json" 2>/dev/null

    # download test-results.xml artifact if available
    ARTS=$(api "https://circleci.com/api/v2/project/$PROJECT_SLUG/$jn/artifacts")
    XML_URL=$(echo "$ARTS" | jq -r '.items[] | select(.path | test("test-results")) | .url' 2>/dev/null)
    if [ -n "$XML_URL" ] && [ "$XML_URL" != "null" ]; then
      curl --noproxy '*' -sL -H "Circle-Token: $CIRCLECI_TOKEN" "$XML_URL" -o "$ARTIFACT_DIR/${JOB_NAME}-test-results.xml"
      echo "  ${JOB_NAME}-test-results.xml"
    fi
  done
fi

[ "$KEEP_BRANCH" = false ] && cleanup_branch "$BRANCH"
[ "$STATUS" = "success" ] && exit 0 || exit 1
