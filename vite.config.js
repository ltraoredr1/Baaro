// dans build.rollupOptions.output
manualChunks(id) {
  if (!id.includes('node_modules')) {
    // Gros composants app (lazy)
    if (id.includes('DiscoverHub')) return 'discover';
    if (id.includes('CommunityTab') || id.includes('EnterprisesTab')) return 'community';
    if (id.includes('VideoTranslate')) return 'video';
    if (id.includes('EngagementList') || id.includes('FriendRequest')) return 'social';
    return null;
  }

  // React + tout ce qui en dépend fortement → même chunk
  if (
    id.includes('node_modules/react/') ||
    id.includes('node_modules/react-dom/') ||
    id.includes('node_modules/scheduler/') ||
    id.includes('react-router') ||
    id.includes('react-redux') ||
    id.includes('@reduxjs/toolkit') ||
    id.includes('react-i18next') ||
    id.includes('i18next')
  ) {
    return 'react-vendor';
  }

  if (id.includes('@supabase')) return 'supabase';
  if (id.includes('@capacitor')) return 'capacitor';
  if (id.includes('lucide-react') || id.includes('framer-motion')) return 'ui';

  return 'vendor';
}
