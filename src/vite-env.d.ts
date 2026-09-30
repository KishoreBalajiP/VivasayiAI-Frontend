/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_COGNITO_DOMAIN: string;
  readonly VITE_COGNITO_CLIENT_ID: string;
  readonly VITE_COGNITO_REDIRECT_URI: string;
  // Optional Raster OSM-compatible tile template for the MapLibre parcel map
  // (e.g. https://tile.openstreetmap.org/{z}/{x}/{y}.png). Falls back to the free
  // OpenStreetMap standard tile server when unset. Never put a secret here.
  readonly VITE_MAP_TILE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}