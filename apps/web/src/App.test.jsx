import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from './App.jsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('EduCloud landing page', () => {
  it('renders a French page and reports the API status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', service: 'educloud-api' }),
    }));

    render(<App />);

    expect(screen.getByRole('heading', { name: 'EduCloud' })).toBeTruthy();
    expect(await screen.findByRole('status')).toHaveTextContent('API : Connectée');
  });

  it('shows an unavailable state when the API request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    render(<App />);

    expect(await screen.findByRole('status')).toHaveTextContent('API : Indisponible');
  });
});
