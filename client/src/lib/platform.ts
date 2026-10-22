export type SupportedPlatform =
  | 'youtube'
  | 'instagram'
  | 'facebook'
  | 'twitter'
  | 'x'
  | 'pinterest'
  | 'vimeo'
  | 'googledrive'
  | 'telegram'
  | 'spotify';

export interface PlatformInfo {
  platform: SupportedPlatform;
  label: string;
  color: string;
  icon: string;
}

const PLATFORM_PATTERNS: Record<SupportedPlatform, RegExp[]> = {
  youtube: [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=[\w-]+/i,
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/[\w-]+/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/[\w-]+/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/[\w-]+/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/playlist\?list=[\w-]+/i,
  ],
  instagram: [
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|tv|stories)\/[\w-]+/i,
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/[\w-]+\/?(?:\?|$)/i,
  ],
  facebook: [
    /(?:https?:\/\/)?(?:www\.)?facebook\.com\/[^/]+\/videos\/[\w-]+/i,
    /(?:https?:\/\/)?(?:www\.)?facebook\.com\/watch\/?\?v=[\w-]+/i,
    /(?:https?:\/\/)?(?:www\.)?fb\.watch\/[\w-]+/i,
    /(?:https?:\/\/)?(?:www\.)?facebook\.com\/reel\/[\w-]+/i,
    /(?:https?:\/\/)?(?:www\.)?facebook\.com\/share\/[\w-]+/i,
  ],
  twitter: [
    /(?:https?:\/\/)?(?:www\.)?twitter\.com\/\w+\/status\/\d+/i,
    /(?:https?:\/\/)?(?:x\.com)\/\w+\/status\/\d+/i,
  ],
  x: [
    /(?:https?:\/\/)?(?:www\.)?x\.com\/\w+\/status\/\d+/i,
    /(?:https?:\/\/)?(?:www\.)?twitter\.com\/\w+\/status\/\d+/i,
  ],
  pinterest: [
    /(?:https?:\/\/)?(?:www\.)?pinterest\.[a-z.]+\/pin\/[\w-]+/i,
    /(?:https?:\/\/)?(?:www\.)?pinterest\.[a-z.]+\/[\w-]+\/[\w-]+\/[\w-]+/i,
    /(?:https?:\/\/)?pin\.it\/[\w-]+/i,
  ],
  vimeo: [
    /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/\d+/i,
    /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/[\w-]+\/\d+/i,
    /(?:https?:\/\/)?player\.vimeo\.com\/video\/\d+/i,
  ],
  googledrive: [
    /(?:https?:\/\/)?(?:www\.)?drive\.google\.com\/file\/d\/([\w-]+)/i,
    /(?:https?:\/\/)?(?:www\.)?drive\.google\.com\/open\?id=([\w-]+)/i,
    /(?:https?:\/\/)?(?:www\.)?drive\.google\.com\/folderview\?id=([\w-]+)/i,
    /(?:https?:\/\/)?(?:www\.)?drive\.google\.com\/drive\/(?:u\/\d\/)?folders\/([\w-]+)/i,
  ],
  telegram: [
    /(?:https?:\/\/)?(?:t\.me|telegram\.me|telegram\.dog)\/\w+\/\d+/i,
    /(?:https?:\/\/)?(?:t\.me|telegram\.me|telegram\.dog)\/c\/\d+\/\d+/i,
  ],
  spotify: [
    /(?:https?:\/\/)?(?:www\.)?open\.spotify\.com\/(?:intl-[\w-]+\/)?(?:track|album|playlist|artist|episode|show|user)\/[\w-]+/i,
    /(?:https?:\/\/)?(?:www\.)?play\.spotify\.com\/(?:track|album|playlist|artist|episode|show)\/[\w-]+/i,
    /(?:https?:\/\/)?(?:www\.)?spotify\.link\/[\w-]+/i,
    /(?:https?:\/\/)?(?:www\.)?link\.spotify\.com\/[\w-]+/i,
  ],
};

export const PLATFORM_INFO: Record<SupportedPlatform, { label: string; color: string; icon: string }> = {
  youtube: { label: 'YouTube', color: '#FF0000', icon: 'youtube' },
  instagram: { label: 'Instagram', color: '#E1306C', icon: 'instagram' },
  facebook: { label: 'Facebook', color: '#1877F2', icon: 'facebook' },
  twitter: { label: 'X (Twitter)', color: '#1DA1F2', icon: 'twitter' },
  x: { label: 'X (Twitter)', color: '#1DA1F2', icon: 'twitter' },
  pinterest: { label: 'Pinterest', color: '#E60023', icon: 'pinterest' },
  vimeo: { label: 'Vimeo', color: '#1AB7EA', icon: 'vimeo' },
  googledrive: { label: 'Google Drive', color: '#34A853', icon: 'googledrive' },
  telegram: { label: 'Telegram', color: '#0088CC', icon: 'telegram' },
  spotify: { label: 'Spotify', color: '#1DB954', icon: 'spotify' },
};

export function detectPlatform(url: string): PlatformInfo | null {
  for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(url)) {
        const info = PLATFORM_INFO[platform as SupportedPlatform];
        return { platform: platform as SupportedPlatform, ...info };
      }
    }
  }
  return null;
}

export const QUALITY_OPTIONS = [
  { value: 'best', label: 'Best Quality', description: 'Highest quality available', icon: '👑' },
  { value: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]', label: '1080p', description: 'Full HD', icon: '📺' },
  { value: 'bestvideo[height<=720]+bestaudio/best[height<=720]', label: '720p', description: 'HD ready', icon: '📱' },
  { value: 'bestvideo[height<=480]+bestaudio/best[height<=480]', label: '480p', description: 'Standard', icon: '💻' },
  { value: 'bestvideo[height<=360]+bestaudio/best[height<=360]', label: '360p', description: 'Low quality', icon: '📱' },
  { value: 'bestaudio/best', label: 'Audio Only', description: 'MP3 audio', icon: '🎵' },
] as const;

export const DOWNLOAD_STEPS = [
  { key: 'preparing', label: 'Preparing', description: 'Setting up download...' },
  { key: 'extracting', label: 'Extracting', description: 'Fetching media info...' },
  { key: 'downloading', label: 'Downloading', description: 'Downloading media...' },
  { key: 'merging', label: 'Merging', description: 'Merging audio & video...' },
  { key: 'completed', label: 'Completed', description: 'Download finished!' },
] as const;

export type DownloadStep = typeof DOWNLOAD_STEPS[number]['key'];
