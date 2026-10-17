import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../i18n';
import i18n from '../i18n';
import { LocationContext, type LocationContextValue } from '../context/LocationContext';

const authState = {
  user: { email: 'farmer@example.test', name: 'Murugan' },
  language: 'en' as const,
  setLanguage: vi.fn(),
  logout: vi.fn(),
  isAdmin: false,
};
vi.mock('../context/AuthContext', () => ({ useAuth: () => authState }));

import { Navbar } from './Navbar';

// A device location that produced the original bug: an AP fix next to a Chennai farm.
const outsideDevice: LocationContextValue = {
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
  precision: 'geocoded',
  stateName: 'Andhra Pradesh',
  requestLocation: vi.fn(),
};

const renderNavbar = (props: Partial<Parameters<typeof Navbar>[0]> = {}, location = outsideDevice) => {
  const onSelectSection = vi.fn();
  const onOpenProfile = vi.fn();
  render(
    <LocationContext.Provider value={location}>
      <Navbar
        hasProfile
        farmDistrict="Chennai"
        onOpenProfile={onOpenProfile}
        onOpenManageParcels={vi.fn()}
        section="chat"
        onSelectSection={onSelectSection}
        {...props}
      />
    </LocationContext.Provider>
  );
  return { onSelectSection, onOpenProfile };
};

beforeEach(async () => {
  authState.isAdmin = false;
  await i18n.changeLanguage('en');
});

describe('Navbar', () => {
  it('UI-10: nav buttons keep accessible names at 360px (labels are sr-only, not display:none)', () => {
    window.innerWidth = 360;
    authState.isAdmin = true;
    renderNavbar();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    for (const name of ['Assistant', 'Claims', 'Admin']) {
      const button = within(nav).getByRole('button', { name });
      const label = within(button).getByText(name);
      expect(label).toHaveClass('sr-only', 'sm:not-sr-only');
      expect(label).not.toHaveClass('hidden');
    }
    expect(within(nav).getByRole('button', { name: 'Assistant' })).toHaveAttribute('aria-current', 'page');
  });

  it('UI-10: language buttons are named by their language, and the account/close-menu labels are translated', async () => {
    const user = userEvent.setup();
    renderNavbar({}, outsideDevice);
    const group = screen.getByRole('group', { name: 'Change Language' });
    expect(within(group).getByRole('button', { name: 'தமிழ்' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'farmer@example.test' }));
    expect(screen.getByRole('button', { name: 'Close menu' })).toBeInTheDocument();

    await i18n.changeLanguage('ta');
    expect(await screen.findByRole('button', { name: 'பட்டியலை மூடு' })).toBeInTheDocument();
  });

  it('UI-10: nav buttons report the chosen section', async () => {
    const user = userEvent.setup();
    const { onSelectSection } = renderNavbar();
    await user.click(screen.getByRole('button', { name: 'Claims' }));
    expect(onSelectSection).toHaveBeenCalledWith('claims');
  });

  // The global ring is brand-700, under 2:1 on the brand-900 header and brand-800 pills. index.css
  // turns it white inside [data-surface="dark"] and back to brand-700 inside a nested
  // [data-surface="light"] (rules and contrast pinned by UI-9 in tokens.test.ts). This checks that
  // every header control actually sits in the right surface and does not opt out of the ring.
  it('UI-10: every control on the dark header gets the light keyboard focus ring; the white menu keeps the default', async () => {
    const user = userEvent.setup();
    authState.isAdmin = true;
    renderNavbar();
    const header = screen.getByRole('banner');
    // The surface marker must sit on the element that actually paints the dark background.
    expect(header).toHaveAttribute('data-surface', 'dark');
    expect(header).toHaveClass('bg-brand-900');

    // A focus/focus-visible outline utility on a control would override the scoped ring colour.
    const OPTS_OUT_OF_RING = /(^|\s)focus(-visible)?:outline-(?!offset)/;
    const onDark = within(header).getAllByRole('button');
    // farm chip + Assistant/Claims/Admin + தமிழ்/English + account avatar
    expect(onDark).toHaveLength(7);
    for (const button of onDark) {
      const label = button.getAttribute('aria-label') ?? button.textContent ?? '';
      expect(button.closest('[data-surface]'), label).toBe(header);
      expect(button.className, label).not.toMatch(OPTS_OUT_OF_RING);
    }

    await user.click(screen.getByRole('button', { name: 'farmer@example.test' }));
    for (const name of ['Farm Profile', 'Manage Parcels', 'Logout']) {
      const item = screen.getByRole('button', { name });
      const surface = item.closest('[data-surface]');
      expect(surface, name).toHaveAttribute('data-surface', 'light');
      expect(surface, name).toHaveClass('bg-white');
      // Nested inside the dark header, so the light-in-dark rule (not just the dark one) applies.
      expect(header.contains(surface), name).toBe(true);
      expect(item.className, name).not.toMatch(OPTS_OUT_OF_RING);
      // The menu is overflow-hidden and the items are full width: an outside ring would be clipped.
      expect(item, name).toHaveClass('focus-visible:outline-offset-[-2px]');
    }
  });

  it('LOC-11: the header shows the FARM district and never the device place or "Outside Tamil Nadu"', () => {
    renderNavbar({ farmDistrict: 'Chennai' }, outsideDevice);
    const chip = screen.getByTestId('header-farm-chip');
    expect(chip).toHaveTextContent('Farm: Chennai');
    const header = screen.getByRole('banner');
    expect(header).not.toHaveTextContent(/Andhra Pradesh|Tirupati|Outside Tamil Nadu/i);
  });

  it('LOC-11: with no farm district the chip invites setting it and opens the profile editor', async () => {
    const user = userEvent.setup();
    const { onOpenProfile } = renderNavbar({ farmDistrict: null, hasProfile: false });
    await user.click(screen.getByRole('button', { name: /Set farm district/ }));
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('banner')).not.toHaveTextContent(/Andhra Pradesh|Outside Tamil Nadu/i);
  });

  it('LOC-11: while the profile is unknown the chip is hidden instead of flashing "Set farm district"', () => {
    renderNavbar({ farmDistrict: null, profileUnknown: true });
    expect(screen.queryByTestId('header-farm-chip')).not.toBeInTheDocument();
  });
});
