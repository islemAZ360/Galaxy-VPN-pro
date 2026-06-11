import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GalaxyVPN Pro',
    short_name: 'GalaxyVPN',
    description: 'Fast, secure, and private internet across the galaxy.',
    start_url: '/en',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#22d3ee',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
