import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAsync } from '../../app/hooks/useAsync';

describe('useAsync', () => {
    it('starts with loading=true when immediate=true', () => {
        const { result } = renderHook(() => useAsync(async () => 'data', { immediate: true }));
        expect(result.current.loading).toBe(true);
        expect(result.current.data).toBe(null);
    });

    it('starts with loading=false when immediate=false', () => {
        const { result } = renderHook(() => useAsync(async () => 'data', { immediate: false }));
        expect(result.current.loading).toBe(false);
    });

    it('sets data on success', async () => {
        const { result } = renderHook(() => useAsync(async () => 'success'));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.data).toBe('success');
        expect(result.current.error).toBe(null);
    });

    it('sets error on failure', async () => {
        const { result } = renderHook(() =>
            useAsync(async () => {
                throw new Error('fail');
            })
        );
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.data).toBe(null);
        expect(result.current.error).toBe('fail');
    });

    it('calls onSuccess callback', async () => {
        const onSuccess = vi.fn();
        renderHook(() => useAsync(async () => 'data', { onSuccess }));
        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('data'));
    });

    it('calls onError callback', async () => {
        const onError = vi.fn();
        renderHook(() =>
            useAsync(
                async () => {
                    throw new Error('fail');
                },
                { onError }
            )
        );
        await waitFor(() => expect(onError).toHaveBeenCalledWith('fail'));
    });

    it('can be executed manually', async () => {
        const { result } = renderHook(() => useAsync(async () => 'manual', { immediate: false }));
        expect(result.current.data).toBe(null);
        result.current.execute();
        await waitFor(() => expect(result.current.data).toBe('manual'));
    });

    it('can be reset', async () => {
        const { result } = renderHook(() => useAsync(async () => 'data'));
        await waitFor(() => expect(result.current.data).toBe('data'));
        act(() => { result.current.reset(); });
        await waitFor(() => expect(result.current.data).toBe(null));
        expect(result.current.error).toBe(null);
        expect(result.current.loading).toBe(false);
    });
});
