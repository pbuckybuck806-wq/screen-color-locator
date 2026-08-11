export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type ScreenDerivedStatus = "on_shelf" | "in_production";
export type SrStatus = "active" | "washed" | "decommissioned";
export type SrType = "permanent" | "one_off";
export type WashReason = "one_off_returned" | "manual_request" | "stale_permanent";

export type SrRow = {
  id: number;
  code: string;
  design: string | null;
  channel: string | null;
  srType: SrType;
  firstShotAt: string;
  lastUsedAt: string | null;
  useCount: number;
  dueForWash: boolean;
  washReason: WashReason | null;
  checkedOut: boolean;
};

export type ScreenSearchResult = {
  screenId: number;
  screen: number;
  status: ScreenDerivedStatus;
  cart: string | null;
  shelf: string | null;
  srs: SrRow[];
};

export type BucketStatus = "available" | "in_use" | "empty";
export type BucketFullness = "full" | "medium" | "low" | "empty";

export type BucketType = { id: number; name: string; tareWeight: number; capacity: number; isDefault: boolean };

export type BucketRow = {
  id: number;
  loc: string;
  bucketTypeId: number;
  bucketTypeName: string;
  tareWeight: number;
  capacity: number;
  currentAmount: number;
  fullness: BucketFullness;
  status: BucketStatus;
  isPrimary: boolean;
  lastWeighedAt: string | null;
  lastMeasuredWeight: number | null;
};

export type ColorSearchResult = {
  colorId: number;
  pmsCode: string;
  name: string;
  hex: string;
  createdAt: string;
  lastUsedAt: string | null;
  freshnessWarning: boolean;
  buckets: BucketRow[];
};

export type ShelfRow = {
  shelfId: number;
  position: number;
  code: string;
  barcode: string;
  occupied: boolean;
};

export type CartWithShelves = {
  cartId: number;
  cartCode: string;
  shelfCount: number;
  shelves: ShelfRow[];
};

export type SettingsData = {
  unit: string;
  inkFreshnessMonths: number;
  screenWashStaleMonths: number;
  maxSrPerScreen: number | null;
  hasApprovalCode: boolean;
  fullnessFullPct: number;
  fullnessMediumPct: number;
  fullnessEmptyPct: number;
  bucketTypes: BucketType[];
};
