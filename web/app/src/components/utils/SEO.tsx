import { useEffect } from 'react';

interface SEOProps {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  image?: string;
  schema?: Record<string, unknown>;
}

const SEO = ({ title, description, canonicalUrl, image, schema }: SEOProps) => {
  useEffect(() => {
    const baseTitle = 'Phantom';
    const finalTitle = title
      ? `${baseTitle} | ${title}`
      : `${baseTitle} — YouTube, Spotify, TikTok & Instagram Downloader · 4K MP3`;

    document.title = finalTitle;

    const defaultDescription =
      'Free downloader & converter for YouTube, Spotify, TikTok, Instagram, Facebook, SoundCloud. 4K video, 320kbps MP3, AI stem separation. No ads, no signup.';
    const finalDescription = description || defaultDescription;

    const updateMetaTag = (
      property: string,
      content: string,
      attr = 'name'
    ) => {
      const id = `dynamic-meta-${property.replace(/[^a-zA-Z0-9]/g, '-')}`;
      let element = document.getElementById(id) as HTMLMetaElement;

      if (!element) {
        element = document.createElement('meta');
        element.id = id;
        element.setAttribute(attr, property);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    updateMetaTag('description', finalDescription);
    updateMetaTag('og:title', finalTitle, 'property');
    updateMetaTag('og:description', finalDescription, 'property');
    updateMetaTag('og:url', window.location.href, 'property');
    if (image) updateMetaTag('og:image', image, 'property');

    updateMetaTag('twitter:title', finalTitle, 'property');
    updateMetaTag('twitter:description', finalDescription, 'property');
    if (image) updateMetaTag('twitter:image', image, 'property');

    // set canonical
    let canonical = document.getElementById(
      'dynamic-canonical'
    ) as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.id = 'dynamic-canonical';
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    const fullUrl = canonicalUrl
      ? `${window.location.origin}${canonicalUrl}`
      : window.location.href;
    canonical.setAttribute('href', fullUrl);

    // inject JSON-LD
    let schemaScript = document.getElementById(
      'page-schema'
    ) as HTMLScriptElement;
    if (schema) {
      if (!schemaScript) {
        schemaScript = document.createElement('script');
        schemaScript.id = 'page-schema';
        schemaScript.type = 'application/ld+json';
        document.head.appendChild(schemaScript);
      }
      schemaScript.innerHTML = JSON.stringify(schema);
    } else if (schemaScript) {
      schemaScript.remove();
    }

    return () => {
      // cleanup schema
      const script = document.getElementById('page-schema');
      if (script) script.remove();

      // cleanup tags
      document.querySelectorAll('[id^="dynamic-meta-"]').forEach((tag) => {
        tag.remove();
      });
      const canon = document.getElementById('dynamic-canonical');
      if (canon) canon.remove();
    };
  }, [title, description, canonicalUrl, image, schema]);

  return null;
};

export default SEO;
