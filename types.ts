export enum GameState {
  WAITING_FOR_INPUT = 'WAITING_FOR_INPUT',
  CHARGING = 'CHARGING',
  FIRING = 'FIRING',
  PROJECTILE_FLYING = 'PROJECTILE_FLYING',
  EXPLOSION = 'EXPLOSION',
  GAME_OVER = 'GAME_OVER'
}

export enum WeaponType {
  BAZOOKA = 'BAZOOKA',
  GRENADE = 'GRENADE'
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface Worm {
  id: number;
  teamId: number;
  name: string;
  hp: number;
  position: Position;
  rotation: number; // y-axis rotation (facing left/right)
  aimAngle: number; // vertical angle
  isDead: boolean;
}

export interface Projectile {
  position: Position;
  velocity: Position;
  active: boolean;
}

export interface GameConfig {
  gravity: number;
  wind: number;
  explosionRadius: number;
  moveSpeed: number;
  jumpForce: number;
}