import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { customersApi } from '../api/customers'
import { ApiError } from '../api/client'

interface FormState {
  name:    string
  phone:   string
  address: string
  notes:   string
}

const EMPTY: FormState = { name: '', phone: '', address: '', notes: '' }

export default function AddCustomerPage() {
  const navigate = useNavigate()
  const [form,     setForm]     = useState<FormState>(EMPTY)
  const [errors,   setErrors]   = useState<Partial<FormState>>({})
  const [saving,   setSaving]   = useState(false)
  const [apiError, setApiError] = useState('')
  const [dupId,    setDupId]    = useState<string | null>(null)

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    setErrors(er => ({ ...er, [k]: '' }))
    setApiError('')
    setDupId(null)
  }

  const validate = (): boolean => {
    const errs: Partial<FormState> = {}
    if (!form.name.trim())  errs.name  = 'Customer name is required'
    if (!form.phone.trim()) errs.phone = 'Phone number is required'
    else if (!/^\d{10,15}$/.test(form.phone.replace(/[\s\-+]/g, '')))
      errs.phone = 'Enter a valid phone number (10–15 digits)'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    setApiError('')
    setDupId(null)
    try {
      const customer = await customersApi.create({
        name:    form.name.trim(),
        phone:   form.phone.trim(),
        address: form.address.trim() || undefined,
        notes:   form.notes.trim()   || undefined,
      })
      navigate(`/customers/${customer.id}`)
    } catch (err: unknown) {
      // 409 means the phone number is already registered. The server sends the
      // existing customer back so we can offer a link straight to their
      // profile instead of leaving the user at a dead end.
      if (err instanceof ApiError && err.status === 409) {
        const existing = (err.data as { existing_customer?: { id?: string } } | null)
          ?.existing_customer
        setDupId(existing?.id ?? null)
        setApiError('A customer with this phone number already exists.')
      } else {
        setApiError((err as Error).message)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={() => navigate('/customers')} className="hover:text-gold-400 transition-colors">
          Customers
        </button>
        <span>/</span>
        <span className="text-white">Add New Customer</span>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="calc-header flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gold-500/20 border border-gold-500/40 flex items-center justify-center">
            <svg className="w-5 h-5 text-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white"
                style={{ fontFamily: "'Playfair Display', serif" }}>
              Add New Customer
            </h2>
            <p className="text-xs text-gray-400">Phone number is the unique identifier</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5">
          {/* API error / duplicate warning */}
          {apiError && (
            <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-xl text-sm">
              <p className="text-red-400 font-medium">{apiError}</p>
              {dupId && (
                <button
                  type="button"
                  onClick={() => navigate(`/customers/${dupId}`)}
                  className="mt-2 text-gold-400 text-xs hover:underline flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                  Open existing customer profile →
                </button>
              )}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="input-label">Full Name <span className="text-red-400">*</span></label>
            <input
              type="text"
              className={`input-field ${errors.name ? 'border-red-500' : ''}`}
              placeholder="e.g. Rahul Sharma"
              value={form.name}
              onChange={set('name')}
              autoFocus
            />
            {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="input-label">Phone Number <span className="text-red-400">*</span></label>
            <input
              type="tel"
              className={`input-field ${errors.phone ? 'border-red-500' : ''}`}
              placeholder="e.g. 9876543210"
              value={form.phone}
              onChange={set('phone')}
            />
            {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
            <p className="text-gray-500 text-xs mt-1">Used as unique identifier — cannot be duplicated</p>
          </div>

          {/* Address */}
          <div>
            <label className="input-label">Address <span className="text-gray-500">(optional)</span></label>
            <textarea
              className="input-field resize-none"
              rows={2}
              placeholder="Street, area, city…"
              value={form.address}
              onChange={set('address')}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="input-label">Notes <span className="text-gray-500">(optional)</span></label>
            <textarea
              className="input-field resize-none"
              rows={2}
              placeholder="Any additional info about this customer…"
              value={form.notes}
              onChange={set('notes')}
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="btn-gold flex-1 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Saving…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                  </svg>
                  Save Customer
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate('/customers')}
              className="btn-ghost"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
