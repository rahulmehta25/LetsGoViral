export interface MusicTrack {
  id: string;
  name: string;
  src: string;
}

export const MUSIC_TRACKS: MusicTrack[] = [
  { id: 'new-dream',         name: 'New Dream',          src: '/music/daynigthmorning-new-dream-background-music-465079.mp3' },
  { id: 'background-chill',  name: 'Background Chill',   src: '/music/delosound-background-music-471141.mp3' },
  { id: 'trap-hype',         name: 'Trap Hype Beat',     src: '/music/delosound-trap-hype-beat-466459.mp3' },
  { id: 'trap-hype-ii',      name: 'Trap Hype Beat II',  src: '/music/delosound-trap-hype-beat-471128.mp3' },
  { id: 'dark-ambient',      name: 'Dark Ambient',       src: '/music/keyframe_audio-dark-horror-ambient-dark-room-133815.mp3' },
  { id: 'background-vibes',  name: 'Background Vibes',   src: '/music/nastelbom-background-music-463062.mp3' },
  { id: 'criminal-trap',     name: 'Trap Beat', src: '/music/poradovskyi-hype-criminal-trap-beat-426799.mp3' },
  { id: 'mystic-dreampop',   name: 'Mystic Dreampop',    src: '/music/restum-anoush-mystic-dreampopelectronicupbeat-262892.mp3' },
];
