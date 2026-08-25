import GoldCalculator      from '../components/GoldCalculator'
import InterestCalculator  from '../components/InterestCalculator'
import { SHOP_NAME }       from '../App'

export default function CalculatorPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Page title */}
      <div>
        <h2 className="text-xl font-bold text-white"
            style={{ fontFamily: "'Playfair Display', serif" }}>
          Calculators
        </h2>
        <p className="text-gray-400 text-sm mt-0.5">
          Gold / Silver valuation &amp; loan interest calculation
        </p>
      </div>

      {/* Two-column grid on xl screens, stacked on smaller */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <GoldCalculator     shopName={SHOP_NAME} />
        <InterestCalculator shopName={SHOP_NAME} />
      </div>
    </div>
  )
}
