import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from '../../app/context/AuthContext';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
);

const mockFetch = (response: object, ok = true) => {
    global.fetch = vi.fn().mockResolvedValue({
        ok,
        status: ok ? 200 : 401,
        json: () => Promise.resolve(response),
    } as Response);
};

describe('AuthContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('starts unauthenticated when no token stored', async () => {
        mockFetch({}, false);
        const { result } = renderHook(() => useAuth(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBe(null);
    });

    it('logs in and sets user', async () => {
        mockFetch({
            success: true,
            data: {
                token: 'jwt-token',
                user: { id: '1', name: 'Juan', email: 'juan@test.com', role: 'parishioner', parishId: 'st-marys' },
            },
        });
        const { result } = renderHook(() => useAuth(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => {
            await result.current.login('juan@test.com', 'Password1');
        });
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user?.name).toBe('Juan');
    });

    it('throws on bad credentials', async () => {
        mockFetch({ success: false, message: 'Invalid credentials' }, false);
        const { result } = renderHook(() => useAuth(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await expect(result.current.login('bad@test.com', 'wrong')).rejects.toThrow('Invalid credentials');
    });

    it('logs out and clears user', async () => {
        mockFetch({
            success: true,
            data: {
                token: 'jwt-token',
                user: { id: '1', name: 'Juan', email: 'juan@test.com', role: 'parishioner', parishId: 'st-marys' },
            },
        });
        const { result } = renderHook(() => useAuth(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => { await result.current.login('juan@test.com', 'Password1'); });
        act(() => { result.current.logout(); });
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBe(null);
    });

    it('isAdmin is true for admin role', async () => {
        mockFetch({
            success: true,
            data: {
                token: 'jwt',
                user: { id: '2', name: 'Admin', email: 'admin@test.com', role: 'admin', parishId: 'st-marys' },
            },
        });
        const { result } = renderHook(() => useAuth(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => { await result.current.login('admin@test.com', 'Admin@1234'); });
        expect(result.current.isAdmin).toBe(true);
        expect(result.current.isSuperAdmin).toBe(false);
    });
});
