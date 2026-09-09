interface Metadata {
  title: string;
  description: string;
  image?: string;
  schema?: Record<string, unknown>;
}

const SITE_CONFIG = {
  name: 'Phantom',
  defaultDescription:
    'A simple tool for high-quality YouTube and Spotify media extraction. Supports 4K video and MP3 downloads from various social platforms.',
  defaultImage: '/app/og-image.webp',
};

const PAGE_METADATA: Record<string, Metadata> = {};

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const path = url.pathname;

  const response = await context.next();

  // check path
  if (
    !PAGE_METADATA[path] ||
    !response.headers.get('content-type')?.includes('text/html')
  ) {
    return response;
  }

  const metadata = PAGE_METADATA[path];
  const finalTitle = `${SITE_CONFIG.name} | ${metadata.title}`;
  const finalDescription = metadata.description;
  const finalImage = metadata.image || SITE_CONFIG.defaultImage;

  // htmlrewriter stream transformation
  return new HTMLRewriter()
    .on('title', {
      element(e) {
        e.setInnerContent(finalTitle);
      },
    })
    .on('meta[name="description"]', {
      element(e) {
        e.setAttribute('content', finalDescription);
      },
    })
    .on('link[rel="canonical"]', {
      element(e) {
        e.setAttribute('href', url.href);
      },
    })
    .on('meta[property^="og:"]', {
      element(e) {
        const prop = e.getAttribute('property');
        if (prop === 'og:title') e.setAttribute('content', finalTitle);
        if (prop === 'og:description')
          e.setAttribute('content', finalDescription);
        if (prop === 'og:url') e.setAttribute('content', url.href);
        if (prop === 'og:image') e.setAttribute('content', finalImage);
      },
    })
    .on('meta[property^="twitter:"]', {
      element(e) {
        const prop = e.getAttribute('property');
        if (prop === 'twitter:title') e.setAttribute('content', finalTitle);
        if (prop === 'twitter:description')
          e.setAttribute('content', finalDescription);
        if (prop === 'twitter:image') e.setAttribute('content', finalImage);
      },
    })
    .on('script#global-schema', {
      element(e) {
        // update schema
        if (metadata.schema) {
          e.setInnerContent(JSON.stringify(metadata.schema), { html: true });
        }
      },
    })
    .transform(response);
};
