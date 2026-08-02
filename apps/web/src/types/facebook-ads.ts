export type FacebookAdsConnectionStatus =
  'DISCONNECTED' | 'CONNECTED' | 'SYNCING' | 'TOKEN_EXPIRED' | 'NO_AD_ACCOUNT_ACCESS' | 'ERROR';

export type FacebookAdsSyncStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';

export interface FacebookAdsStatus {
  status: FacebookAdsConnectionStatus | 'DISCONNECTED';
  connected: boolean;
  selectedAdAccountId: string | null;
  selectedAdAccountName: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: FacebookAdsSyncStatus | null;
  lastSyncError: string | null;
  tokenExpiresAt: string | null;
  facebookUserId?: string | null;
  permissions?: {
    ads_read: 'granted' | 'missing' | 'expired';
    ads_management: 'granted' | 'missing' | 'expired';
    granted: string[];
    missing: string[];
    expired: boolean;
    checkedAt: string | null;
    source: string;
  };
  canReadAds?: boolean;
  canManageAds?: boolean;
}

export interface FacebookAdAccount {
  id: string;
  accountId: string;
  name: string;
  currency: string;
  accountStatus?: number;
}

export interface FacebookSyncedCampaign {
  campaignId: string;
  campaignName: string;
  campaignType: string;
  objective: string | null;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  cpm: number;
  cpc: number;
  ctr: number;
  clicks: number;
  results: number;
  costPerResult: number;
  purchaseRoas: number | null;
  resultRate: number;
  syncedAt: string;
}

export interface FacebookSyncLog {
  id: string;
  adAccountId: string;
  dateFrom: string;
  dateTo: string;
  syncStartedAt: string;
  syncFinishedAt: string | null;
  status: FacebookAdsSyncStatus;
  errorMessage: string | null;
  campaignsSynced: number;
}

export type FacebookCampaignObjective =
  | 'OUTCOME_ENGAGEMENT'
  | 'OUTCOME_TRAFFIC'
  | 'OUTCOME_LEADS'
  | 'OUTCOME_AWARENESS'
  | 'OUTCOME_SALES';

export interface CreateFacebookCampaignInput {
  name: string;
  objective: FacebookCampaignObjective;
}

export interface CreatedFacebookCampaign {
  id: string;
  name: string;
  objective: string;
  status: string;
  adAccountId: string;
  message: string;
}

export interface FacebookLiveCampaign {
  id: string;
  name: string;
  status: string | null;
  effectiveStatus: string | null;
  objective: string | null;
  createdTime: string | null;
  updatedTime: string | null;
}

export interface FacebookLiveCampaignsResponse {
  adAccountId: string;
  summary: {
    total: number;
    active: number;
    paused: number;
    other: number;
  };
  items: FacebookLiveCampaign[];
}
