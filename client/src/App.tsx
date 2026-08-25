import { useState } from 'react'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'
import Header   from './components/Header'
import Sidebar  from './components/Sidebar'
import DashboardPage       from './pages/DashboardPage'
import CalculatorPage      from './pages/CalculatorPage'
import CustomersPage       from './pages/CustomersPage'
import AddCustomerPage     from './pages/AddCustomerPage'
import CustomerProfilePage from './pages/CustomerProfilePage'
import PaymentsPage        from './pages/PaymentsPage'
import BillsListPage       from './pages/BillsListPage'
import CreateBillPage      from './pages/CreateBillPage'
import BillDetailPage      from './pages/BillDetailPage'

export const SHOP_NAME = 'RJ Jewellers'

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 flex flex-col">

        {/* ── Top header (full width) ─────────────────────────────── */}
        <Header shopName={SHOP_NAME} onMenuToggle={() => setSidebarOpen(o => !o)} />

        <div className="flex flex-1 overflow-hidden">

          {/* ── Sidebar — desktop always visible, mobile drawer ─────── */}
          {/* Desktop */}
          <div className="hidden lg:flex lg:flex-shrink-0 w-56">
            <div className="w-56 flex flex-col">
              <Sidebar />
            </div>
          </div>

          {/* Mobile overlay */}
          {sidebarOpen && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={() => setSidebarOpen(false)}
              />
              <div className="absolute left-0 top-0 h-full w-64 z-50">
                <Sidebar onClose={() => setSidebarOpen(false)} />
              </div>
            </div>
          )}

          {/* ── Main content ─────────────────────────────────────────── */}
          <main className="flex-1 overflow-y-auto">
            <Routes>
              <Route path="/"                    element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard"           element={<DashboardPage />} />
              <Route path="/calculator"          element={<CalculatorPage />} />
              <Route path="/customers"           element={<CustomersPage />} />
              <Route path="/customers/new"       element={<AddCustomerPage />} />
              <Route path="/customers/:id"       element={<CustomerProfilePage />} />
              <Route path="/payments"            element={<PaymentsPage />} />
              <Route path="/bills"               element={<BillsListPage />} />
              <Route path="/bills/new"           element={<CreateBillPage />} />
              <Route path="/bills/:id"           element={<BillDetailPage />} />
              <Route path="*"                    element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}
