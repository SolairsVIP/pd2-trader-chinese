export interface Range {
  min?: number;
  max?: number;
}

export interface Stat {
  stat_id?: number; // Game clipboard skill bonuses can omit the modifier id.
  name: string;
  value?: number;
  range?: Range;
  level?: number;
  corrupted?: boolean; // whether this stat is corrupted
  chance?: number;
  skill?: string; // skill name for skill stats
  charges?: string; // Some game copies export this separately and omit name/stat_id.
}

export interface Socketed {
  name?: string;
  quality: string;
  type: string;
  stats?: Stat[];
  iLevel: number;
  isRune?: boolean;
}

export interface Item {
  name?: string;
  isRuneword?: boolean;
  isEthereal?: boolean;
  runeword?: string;
  quality: string;
  type: string;
  defense?: number;
  iLevel: number;
  sockets?: number;
  socketed?: Socketed[];
  stats: Stat[];
  location?: string;
}
export interface StatOverride {
  name: string;
  displayValue: boolean;
  hasFilter: boolean; // whether this stat can be filtered
}
