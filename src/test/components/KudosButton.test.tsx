import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { KudosButton } from '../../app/components/KudosButton';

// Mock sonner toast
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const mockFetch = (response: object, status = 200) => {
    global.fetch = vi.fn().mockResolvedValue({
        status,
        json: () => Promise.resolve(response),
    } as Response);
};

describe('KudosButton', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.setItem('parish_token', 'test-token');
    });

    it('renders with correct label and cost', () => {
        render(<KudosButton receiverId="user-2" receiverName="Maria" />);
        expect(screen.getByRole('button')).toHaveTextContent('💛 Praise (15)');
    });

    it('is disabled while loading', async () => {
        global.fetch = vi.fn().mockImplementation(() => new Promise(() => { })); // never resolves
        render(<KudosButton receiverId="user-2" receiverName="Maria" />);
        fireEvent.click(screen.getByRole('button'));
        expect(screen.getByRole('button')).toBeDisabled();
    });

    it('shows Praised state after successful kudos', async () => {
        mockFetch({ success: true, message: 'Praise given! 15 GBless sent to Maria.' });
        render(<KudosButton receiverId="user-2" receiverName="Maria" />);
        fireEvent.click(screen.getByRole('button'));
        await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('💛 Praised'));
    });

    it('shows error on insufficient balance', async () => {
        const { toast } = await import('sonner');
        mockFetch({ success: false, code: 'insufficient_balance', message: 'Not enough GBless.' });
        render(<KudosButton receiverId="user-2" receiverName="Maria" />);
        fireEvent.click(screen.getByRole('button'));
        await waitFor(() => expect(toast.error).toHaveBeenCalled());
    });

    it('shows info on rate limit (429)', async () => {
        const { toast } = await import('sonner');
        mockFetch({ success: false }, 429);
        render(<KudosButton receiverId="user-2" receiverName="Maria" />);
        fireEvent.click(screen.getByRole('button'));
        await waitFor(() => expect(toast.info).toHaveBeenCalledWith('You already praised Maria today'));
    });

    it('does not call fetch if already given', async () => {
        mockFetch({ success: true, message: 'done' });
        render(<KudosButton receiverId="user-2" receiverName="Maria" />);
        fireEvent.click(screen.getByRole('button'));
        await waitFor(() => screen.getByText('💛 Praised'));
        vi.clearAllMocks();
        fireEvent.click(screen.getByRole('button'));
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
