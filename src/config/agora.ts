const FALLBACK_AGORA_APP_ID = '07cf36ba5a9d448ca14f57e616face7a';

export const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID?.trim() || FALLBACK_AGORA_APP_ID;
export const AGORA_TOKEN_ENDPOINT = import.meta.env.VITE_AGORA_TOKEN_ENDPOINT?.trim() || '';

export const isAgoraConfigured = AGORA_APP_ID.length > 0;
