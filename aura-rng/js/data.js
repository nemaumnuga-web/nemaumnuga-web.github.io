// Aura definitions.
// odds  : base "1 in N"
// tier  : 0..5 presentation tier (drives cutscene, camera, sound weight)
// colors: a = primary, b = secondary, c = accent (hex)
// fx    : declarative description consumed by AuraFx (auraFx.js)
// sound : declarative description consumed by AudioEngine (audio.js)

export const RARITY_COLORS = {
  Common: '#b8c0cc', Uncommon: '#4ade80', Rare: '#38bdf8', Epic: '#c084fc',
  Legendary: '#fde047', Mythic: '#fb7185', Divine: '#f5d0fe', Celestial: '#67e8f9',
  Eternal: '#fcd34d', Void: '#a78bfa', Impossible: '#ff2d55',
};

export const AURAS = [
  {
    id: 'breeze', name: 'Breeze', rarity: 'Common', odds: 2, tier: 0,
    colors: { a: '#dfe7f1', b: '#8fa3bd', c: '#ffffff' },
    lore: '어디서나 불어오는 잔잔한 바람.',
    fx: {
      particles: [{ mode: 'rise', count: 90, size: 0.18, speed: 0.22, radius: 1.6, height: 5.5, color: ['a', 'b'] }],
      light: 0.6,
    },
    sound: { root: 60, scale: 'penta', wave: 'sine', bright: 900, noise: 0.25, shimmer: false, sub: false },
  },
  {
    id: 'sprout', name: 'Sprout', rarity: 'Uncommon', odds: 6, tier: 0,
    colors: { a: '#4ade80', b: '#166534', c: '#bbf7d0' },
    lore: '땅에서 막 돋아난 생명의 기운.',
    fx: {
      particles: [
        { mode: 'orbit', count: 70, size: 0.22, speed: 0.35, radius: 1.9, height: 4.6, color: ['a', 'c'] },
        { mode: 'rise', count: 50, size: 0.12, speed: 0.18, radius: 1.3, height: 3.5, color: ['b', 'a'] },
      ],
      rings: [{ kind: 'ground', radius: 2.2, width: 0.12, speed: 0.4, color: 'a' }],
      light: 0.8,
    },
    sound: { root: 62, scale: 'major', wave: 'triangle', bright: 1400, noise: 0.15, shimmer: false, sub: false },
  },
  {
    id: 'ember', name: 'Ember', rarity: 'Rare', odds: 20, tier: 1,
    colors: { a: '#ff7a1a', b: '#ff2a00', c: '#ffd36b' },
    lore: '꺼지지 않는 불씨. 가까이 가면 따뜻하다.',
    fx: {
      particles: [
        { mode: 'flame', count: 220, size: 0.32, speed: 0.75, radius: 1.3, height: 5.8, color: ['c', 'b'] },
        { mode: 'rise', count: 60, size: 0.1, speed: 0.4, radius: 2.2, height: 7, color: ['c', 'a'], shape: 'star' },
      ],
      light: 1.6, flicker: true,
    },
    sound: { root: 57, scale: 'minor', wave: 'sawtooth', bright: 700, noise: 0.45, crackle: true, shimmer: false, sub: false },
  },
  {
    id: 'frost', name: 'Frostbite', rarity: 'Epic', odds: 75, tier: 1,
    colors: { a: '#7dd3fc', b: '#2563eb', c: '#f0f9ff' },
    lore: '숨결마저 얼어붙는 북쪽 끝의 냉기.',
    fx: {
      particles: [
        { mode: 'helix', count: 260, size: 0.2, speed: 0.3, radius: 1.7, height: 6.2, color: ['c', 'a'], shape: 'star' },
        { mode: 'rain', count: 120, size: 0.12, speed: 0.25, radius: 3.2, height: 8, color: ['c', 'a'] },
      ],
      rings: [{ kind: 'ground', radius: 2.4, width: 0.18, speed: -0.3, color: 'a' }],
      light: 1.4,
    },
    sound: { root: 64, scale: 'lydian', wave: 'triangle', bright: 2600, noise: 0.3, shimmer: true, sub: false },
  },
  {
    id: 'nebula', name: 'Nebula', rarity: 'Epic', odds: 200, tier: 2,
    colors: { a: '#c084fc', b: '#4c1d95', c: '#f0abfc' },
    lore: '먼 성운의 먼지가 몸을 감싸 돈다.',
    fx: {
      particles: [
        { mode: 'swirl', count: 380, size: 0.24, speed: 0.22, radius: 1.5, height: 6.5, color: ['a', 'c'] },
        { mode: 'orbit', count: 120, size: 0.1, speed: 0.15, radius: 3.4, height: 6, color: ['c', 'a'], shape: 'star' },
      ],
      orbs: { count: 3, radius: 2.1, speed: 0.9, height: 3.4, color: 'c' },
      rings: [{ kind: 'circle', radius: 2.8, speed: 0.15, color: 'a' }],
      light: 1.8,
    },
    sound: { root: 55, scale: 'whole', wave: 'sine', bright: 1800, noise: 0.2, shimmer: true, sub: false },
  },
  {
    id: 'solar', name: 'Solar Flare', rarity: 'Legendary', odds: 1000, tier: 2,
    colors: { a: '#ffd23f', b: '#ff6b00', c: '#fff7c2' },
    lore: '태양 표면에서 떨어져 나온 한 줄기 불꽃.',
    fx: {
      particles: [
        { mode: 'flame', count: 300, size: 0.36, speed: 0.6, radius: 1.5, height: 6.5, color: ['c', 'b'] },
        { mode: 'burst', count: 160, size: 0.16, speed: 0.35, radius: 3.4, height: 5.4, color: ['a', 'c'], shape: 'star' },
      ],
      halo: { color: 'a', radius: 0.62 },
      rings: [
        { kind: 'circle', radius: 3.0, speed: 0.25, color: 'a' },
        { kind: 'float', radius: 2.2, y: 3.0, tilt: 0.35, speed: 1.1, width: 0.05, color: 'b' },
      ],
      light: 3.0, flicker: true,
    },
    sound: { root: 60, scale: 'major', wave: 'sawtooth', bright: 2200, noise: 0.25, shimmer: true, sub: true },
  },
  {
    id: 'bloodmoon', name: 'Blood Moon', rarity: 'Mythic', odds: 5000, tier: 3,
    colors: { a: '#ff2a48', b: '#5c0010', c: '#ff9aa8' },
    lore: '붉은 달이 뜨는 밤, 무언가가 깨어난다.',
    fx: {
      particles: [
        { mode: 'swirl', count: 420, size: 0.26, speed: 0.35, radius: 1.8, height: 7, color: ['a', 'b'] },
        { mode: 'rain', count: 220, size: 0.14, speed: 0.55, radius: 3.6, height: 9, color: ['a', 'c'] },
      ],
      aurora: { colorA: 'a', colorB: 'b', radius: 2.6, height: 7.5 },
      lightning: { color: 'a', rate: 0.9 },
      rings: [{ kind: 'circle', radius: 3.3, speed: -0.2, color: 'a' }],
      light: 2.6, levitate: false,
    },
    sound: { root: 50, scale: 'phrygian', wave: 'sawtooth', bright: 900, noise: 0.5, shimmer: false, sub: true },
  },
  {
    id: 'divine', name: 'Divine Halo', rarity: 'Divine', odds: 25000, tier: 3,
    colors: { a: '#fff1fb', b: '#f472b6', c: '#fde68a' },
    lore: '하늘에서 내려온 빛. 날개가 돋는다.',
    fx: {
      particles: [
        { mode: 'helix', count: 300, size: 0.22, speed: 0.25, radius: 1.6, height: 7, color: ['a', 'c'], shape: 'star' },
        { mode: 'rain', count: 160, size: 0.18, speed: 0.15, radius: 3, height: 9, color: ['a', 'b'] },
      ],
      halo: { color: 'c', radius: 0.7 },
      wings: { color: 'a', tip: 'b', span: 3.4 },
      rings: [{ kind: 'circle', radius: 3.0, speed: 0.12, color: 'c' }],
      light: 3.2, levitate: true,
    },
    sound: { root: 67, scale: 'lydian', wave: 'sine', bright: 3200, noise: 0.1, shimmer: true, sub: false, choir: true },
  },
  {
    id: 'celestial', name: 'Celestial Rift', rarity: 'Celestial', odds: 120000, tier: 4,
    colors: { a: '#5eead4', b: '#1e3a8a', c: '#e0f2fe' },
    lore: '별과 별 사이가 찢어진 틈.',
    fx: {
      particles: [
        { mode: 'swirl', count: 480, size: 0.24, speed: 0.28, radius: 1.6, height: 8, color: ['a', 'c'], shape: 'star' },
        { mode: 'orbit', count: 220, size: 0.14, speed: 0.12, radius: 3.8, height: 7, color: ['c', 'a'] },
        { mode: 'burst', count: 140, size: 0.12, speed: 0.3, radius: 4, height: 5, color: ['a', 'c'] },
      ],
      aurora: { colorA: 'a', colorB: 'b', radius: 2.9, height: 9 },
      orbs: { count: 6, radius: 2.6, speed: 0.7, height: 3.8, color: 'c' },
      lightning: { color: 'c', rate: 0.6 },
      rings: [
        { kind: 'circle', radius: 3.6, speed: 0.2, color: 'a' },
        { kind: 'float', radius: 2.6, y: 2.4, tilt: 0.5, speed: 0.8, width: 0.04, color: 'c' },
        { kind: 'float', radius: 2.9, y: 4.2, tilt: -0.4, speed: -0.6, width: 0.04, color: 'a' },
      ],
      light: 3.4, levitate: true,
    },
    sound: { root: 62, scale: 'lydian', wave: 'triangle', bright: 2600, noise: 0.25, shimmer: true, sub: true, choir: true },
  },
  {
    id: 'eternal', name: 'Eternal Dawn', rarity: 'Eternal', odds: 600000, tier: 4,
    colors: { a: '#ffe08a', b: '#ff8a3d', c: '#ffffff' },
    lore: '끝나지 않는 새벽. 시간이 멈춘 빛.',
    fx: {
      particles: [
        { mode: 'helix', count: 420, size: 0.26, speed: 0.22, radius: 1.8, height: 8, color: ['c', 'a'], shape: 'star' },
        { mode: 'flame', count: 260, size: 0.3, speed: 0.4, radius: 1.4, height: 6, color: ['a', 'b'] },
        { mode: 'burst', count: 200, size: 0.14, speed: 0.25, radius: 4.4, height: 5, color: ['c', 'a'] },
      ],
      halo: { color: 'c', radius: 0.75, double: true },
      wings: { color: 'a', tip: 'b', span: 4.2 },
      aurora: { colorA: 'a', colorB: 'b', radius: 3.0, height: 8.5 },
      rings: [
        { kind: 'circle', radius: 3.8, speed: 0.1, color: 'a' },
        { kind: 'float', radius: 3.1, y: 3.4, tilt: 0.2, speed: 0.5, width: 0.06, color: 'c' },
      ],
      light: 4, levitate: true,
    },
    sound: { root: 64, scale: 'major', wave: 'sawtooth', bright: 3000, noise: 0.15, shimmer: true, sub: true, choir: true },
  },
  {
    id: 'void', name: 'Void Serpent', rarity: 'Void', odds: 3000000, tier: 5,
    colors: { a: '#9b5cff', b: '#12002b', c: '#ff4fd8' },
    lore: '모든 빛을 삼키는 뱀이 몸을 휘감는다.',
    fx: {
      particles: [
        { mode: 'swirl', count: 600, size: 0.3, speed: 0.45, radius: 2.0, height: 8.5, color: ['a', 'c'] },
        { mode: 'helix', count: 360, size: 0.2, speed: 0.5, radius: 2.6, height: 8, color: ['c', 'a'] },
        { mode: 'rain', count: 260, size: 0.12, speed: 0.4, radius: 4.5, height: 10, color: ['a', 'b'] },
      ],
      aurora: { colorA: 'a', colorB: 'c', radius: 3.2, height: 10 },
      lightning: { color: 'c', rate: 1.6 },
      orbs: { count: 4, radius: 3.0, speed: -1.2, height: 4.5, color: 'c' },
      rings: [
        { kind: 'circle', radius: 4.2, speed: -0.3, color: 'a' },
        { kind: 'float', radius: 2.4, y: 1.6, tilt: 0.6, speed: 1.4, width: 0.05, color: 'c' },
        { kind: 'float', radius: 2.8, y: 4.6, tilt: -0.6, speed: -1.1, width: 0.05, color: 'a' },
      ],
      light: 3.6, levitate: true,
    },
    sound: { root: 46, scale: 'phrygian', wave: 'square', bright: 1100, noise: 0.55, shimmer: true, sub: true, choir: false },
  },
  {
    id: 'oblivion', name: 'Oblivion', rarity: 'Impossible', odds: 20000000, tier: 5,
    colors: { a: '#ff1f4b', b: '#ffffff', c: '#ffd0da' },
    lore: '존재하지 않아야 할 아우라. 세계가 멈춘다.',
    fx: {
      particles: [
        { mode: 'swirl', count: 700, size: 0.3, speed: 0.6, radius: 2.0, height: 9, color: ['a', 'b'] },
        { mode: 'helix', count: 420, size: 0.24, speed: 0.35, radius: 2.9, height: 9, color: ['b', 'a'], shape: 'star' },
        { mode: 'burst', count: 300, size: 0.16, speed: 0.4, radius: 5, height: 5, color: ['b', 'c'] },
        { mode: 'rain', count: 300, size: 0.14, speed: 0.8, radius: 5, height: 11, color: ['a', 'b'] },
      ],
      halo: { color: 'b', radius: 0.8, double: true },
      wings: { color: 'b', tip: 'a', span: 4.8 },
      aurora: { colorA: 'a', colorB: 'b', radius: 3.4, height: 11 },
      lightning: { color: 'b', rate: 2.4 },
      orbs: { count: 8, radius: 3.4, speed: 1.0, height: 4.2, color: 'a' },
      rings: [
        { kind: 'circle', radius: 4.6, speed: 0.35, color: 'a' },
        { kind: 'circle', radius: 2.6, speed: -0.6, color: 'b' },
        { kind: 'float', radius: 2.6, y: 2.0, tilt: 0.7, speed: 1.6, width: 0.05, color: 'b' },
        { kind: 'float', radius: 3.2, y: 4.8, tilt: -0.5, speed: -1.3, width: 0.05, color: 'a' },
        { kind: 'float', radius: 3.8, y: 3.4, tilt: 1.2, speed: 0.7, width: 0.04, color: 'c' },
      ],
      light: 4.5, levitate: true,
    },
    sound: { root: 45, scale: 'whole', wave: 'sawtooth', bright: 1600, noise: 0.5, shimmer: true, sub: true, choir: true },
  },
];

export const AURA_BY_ID = Object.fromEntries(AURAS.map(a => [a.id, a]));

export const AVATAR_PRESETS = [
  { name: '클래식', head: '#f5cd30', torso: '#0d69ac', legs: '#a4bd47' },
  { name: '다크', head: '#2b2b33', torso: '#111114', legs: '#1f1f28' },
  { name: '파스텔', head: '#ffe4e6', torso: '#c4b5fd', legs: '#a5f3fc' },
  { name: '레드', head: '#f8d6b3', torso: '#c4281c', legs: '#1b2a35' },
];
