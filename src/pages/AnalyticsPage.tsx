import { BarChart3, PieChart, TrendingUp, FileBarChart } from 'lucide-react';

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Analytics</h1>
        <p className="text-neutral-500 mt-1">Business intelligence and reporting</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: BarChart3, title: 'Financial Reports', desc: 'Revenue, profitability, billing' },
          { icon: PieChart, title: 'Staff Reports', desc: 'Utilization, efficiency' },
          { icon: TrendingUp, title: 'Project Reports', desc: 'Progress, budgets, health' },
          { icon: FileBarChart, title: 'Time Reports', desc: 'Hours, billability, trends' },
        ].map((item, i) => (
          <div key={i} className="bg-white rounded-2xl p-6 border border-neutral-100 hover:shadow-md transition-shadow cursor-pointer">
            <div className="w-12 h-12 bg-[#476E66]/10 rounded-xl flex items-center justify-center mb-4">
              <item.icon className="w-6 h-6 text-neutral-500" />
            </div>
            <h3 className="font-semibold text-neutral-900 mb-1">{item.title}</h3>
            <p className="text-sm text-neutral-500">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-12 border border-neutral-100 text-center">
        <div className="w-20 h-20 bg-[#476E66]/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <BarChart3 className="w-10 h-10 text-neutral-500" />
        </div>
        <h2 className="text-2xl font-semibold text-neutral-900 mb-3">Report Center</h2>
        <p className="text-neutral-500 max-w-md mx-auto">
          Access detailed reports, create custom dashboards, and export data for deeper analysis.
        </p>
        <p className="text-sm text-neutral-400 mt-8">Coming Soon</p>
      </div>
    </div>
  );
}
