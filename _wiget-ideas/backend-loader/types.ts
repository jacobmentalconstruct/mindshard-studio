
export enum LoadingStatus {
  PENDING,
  LOADING,
  COMPLETED,
  FAILED,
}

export interface LoadingItem {
  id: string;
  label: string;
  status: LoadingStatus;
  startLog?: string;
  endLog: string;
  level: number; // For indentation
}

export interface LoadingGroup {
  name: string;
  items: LoadingItem[];
}
