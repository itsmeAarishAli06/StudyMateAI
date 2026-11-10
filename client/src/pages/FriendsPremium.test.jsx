import { render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PlanPage from './PlanPage.jsx'
import AdminAccessPage from './AdminAccessPage.jsx'
import { createFriendsPaymentRequest, getAdminPaymentRequests, reviewAdminFriendsPaymentRequest } from '../lib/api.js'

vi.mock('../lib/api.js', () => ({
  cancelPaymentRequest: vi.fn(),
  createFriendsPaymentRequest: vi.fn(),
  createPaymentRequest: vi.fn(),
  getStudyAccess: vi.fn(),
  getAdminPaymentRequests: vi.fn(),
  reviewAdminFriendsPaymentRequest: vi.fn(),
  reviewAdminPaymentRequest: vi.fn(),
  revokeAdminStudyAccess: vi.fn(),
}))

vi.mock('./AdminStudentsPage.jsx', () => ({ default: () => null }))

const friendAddresses = ['maya@example.com', 'ali@example.com', 'zara@example.com']
const createdRequest = {
  id: 'request-id', requestCode: 'SM-ABC123', offerType: 'friends', planKey: 'weekly', amountPkr: 600,
  status: 'pending', recipientEmails: ['buyer@example.com', ...friendAddresses],
}

function PlanHarness() {
  const [access, setAccess] = useState({ isAdmin: false, premiumActive: false, pendingRequest: null })
  return <PlanPage
    access={access}
    accessStatus="ready"
    token="test-token"
    studentProfile={{ complete: true }}
    studentName="Aarish Ali"
    studentEmail="buyer@example.com"
    onAccessChange={setAccess}
    onNavigate={vi.fn()}
    onToast={vi.fn()}
  />
}

function renderPlan() {
  return render(<PlanHarness />)
}

describe('Friends Premium purchase and review flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createFriendsPaymentRequest.mockResolvedValue(createdRequest)
  })

  it('creates a four-account request and prepares the complete WhatsApp draft', async () => {
    const user = userEvent.setup()
    renderPlan()

    for (const [index, email] of friendAddresses.entries()) {
      await user.type(screen.getByRole('textbox', { name: `Friend ${index + 1} email` }), email)
    }
    await user.click(screen.getByRole('button', { name: /Continue.*Rs 600/ }))

    await screen.findByRole('heading', { name: 'Your request is ready' })
    expect(createFriendsPaymentRequest).toHaveBeenCalledWith('weekly', friendAddresses, 'test-token')
    const whatsapp = screen.getByRole('link', { name: 'Open WhatsApp' })
    const whatsappUrl = new URL(whatsapp.href)
    expect(whatsappUrl.hostname).toBe('wa.me')
    expect(whatsappUrl.pathname).toBe('/923172873743')
    const draft = whatsappUrl.searchParams.get('text')
    expect(draft).toContain('SM-ABC123')
    expect(draft).toContain('Rs 600')
    expect(draft).toContain('buyer@example.com')
    for (const email of friendAddresses) expect(draft).toContain(email)
    expect(screen.getByText(/All four accounts receive the selected duration/)).toBeInTheDocument()
  })

  it('blocks duplicate friend emails with a clear dismissible message', async () => {
    const user = userEvent.setup()
    renderPlan()
    await user.type(screen.getByRole('textbox', { name: 'Friend 1 email' }), friendAddresses[0])
    await user.type(screen.getByRole('textbox', { name: 'Friend 2 email' }), friendAddresses[0])
    await user.type(screen.getByRole('textbox', { name: 'Friend 3 email' }), friendAddresses[2])
    await user.click(screen.getByRole('button', { name: /Continue.*Rs 600/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter three different, valid StudyMate account emails')
    expect(createFriendsPaymentRequest).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Dismiss message' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows all four accounts to the admin and requires a verified reference before atomic approval', async () => {
    const user = userEvent.setup()
    const request = {
      id: 'friends-request-id', request_code: 'SM-GROUP9', user_id: 'buyer-id', user_email: 'buyer@example.com',
      offer_type: 'friends', plan_key: 'monthly', amount_pkr: 1650, status: 'pending', created_at: new Date().toISOString(),
      members: [
        { userId: 'buyer-id', email: 'buyer@example.com', name: 'Aarish' },
        ...friendAddresses.map((email, index) => ({ userId: `friend-${index}`, email, name: '' })),
      ],
    }
    getAdminPaymentRequests.mockResolvedValue([request])
    reviewAdminFriendsPaymentRequest.mockResolvedValue({ result: { status: 'approved', grantedCount: 4 } })
    const onAccessChange = vi.fn()
    render(<AdminAccessPage token="admin-token" onAccessChange={onAccessChange} />)
    await user.click(screen.getByRole('tab', { name: 'Payment requests' }))

    const card = await screen.findByRole('article')
    expect(within(card).getByText(/4 of 4/)).toBeInTheDocument()
    for (const email of ['buyer@example.com', ...friendAddresses]) expect(within(card).getAllByText(email).length).toBeGreaterThan(0)
    await user.click(within(card).getByRole('button', { name: /Verify & activate all 4/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('enter its reference')
    expect(reviewAdminFriendsPaymentRequest).not.toHaveBeenCalled()

    await user.type(within(card).getByRole('textbox', { name: /Verified transaction reference/ }), 'BANK-REF-456')
    await user.click(within(card).getByRole('button', { name: /Verify & activate all 4/ }))
    await waitFor(() => expect(reviewAdminFriendsPaymentRequest).toHaveBeenCalledWith('friends-request-id', expect.objectContaining({
      decision: 'approve', transactionReference: 'BANK-REF-456',
    }), 'admin-token'))
    expect(await screen.findByRole('status')).toHaveTextContent('Friends Premium activated for all four accounts')
    expect(onAccessChange).toHaveBeenCalled()
  })
})
