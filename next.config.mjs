/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // התמונות מוגשות דרך Supabase Storage עם קישורים חתומים קצרי-תוקף
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co' }],
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
