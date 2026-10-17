import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '../i18n';
import { LocationContext, type LocationContextValue } from '../context/LocationContext';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn(), isAuthenticating: false, authError: 'authExpired' }),
}));

import { LoginScreen } from './LoginScreen';

describe('LoginScreen', () => {
  it('LOC-11: the landing page is farm-first and never shows a device place or "Outside Tamil Nadu"', () => {
    const requestLocation = vi.fn();
    const outside: LocationContextValue = {
      status: 'outside-tn',
      district: null,
      coords: { lat: 13.63, lon: 79.42 },
      details: {
        displayName: 'Tirupati, Andhra Pradesh',
        locality: null,
        village: null,
        townCity: 'Tirupati',
        subDistrict: null,
        district: null,
        state: 'Andhra Pradesh',
        country: 'India',
        source: 'nominatim',
        lat: 13.63,
        lon: 79.42,
      },
      errorKey: null,
      requestLocation,
    };
    render(
      <LocationContext.Provider value={outside}>
        <LoginScreen />
      </LocationContext.Provider>
    );

    expect(screen.getByText('Weather and advice for your farm')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Tirupati|Andhra Pradesh|Outside Tamil Nadu/i);
    // No location prompt from the landing page.
    expect(screen.queryByRole('button', { name: /Use my location/i })).not.toBeInTheDocument();
    expect(requestLocation).not.toHaveBeenCalled();
    // The sign-in error is a role=alert banner from the shared Alert primitive.
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Login with Google/i })).toHaveAttribute('type', 'button');
  });
});
