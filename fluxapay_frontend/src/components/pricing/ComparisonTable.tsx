"use client";

import { CheckCircle2, Circle } from "lucide-react";

export interface ComparisonFeature {
  category: string;
  features: Array<{
    name: string;
    starter: boolean;
    growth: boolean;
    enterprise: boolean;
  }>;
}

interface ComparisonTableProps {
  features: ComparisonFeature[];
}

export default function ComparisonTable({ features }: ComparisonTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900 w-1/3">
              Feature
            </th>
            <th className="px-6 py-4 text-center text-sm font-semibold text-slate-900">
              Starter
            </th>
            <th className="px-6 py-4 text-center text-sm font-semibold text-slate-900">
              Growth
            </th>
            <th className="px-6 py-4 text-center text-sm font-semibold text-slate-900">
              Enterprise
            </th>
          </tr>
        </thead>
        <tbody>
          {features.map((featureGroup, groupIndex) => (
            <tbody key={featureGroup.category}>
              <tr className="border-b border-slate-200 bg-slate-50">
                <td colSpan={4} className="px-6 py-3 text-sm font-semibold text-slate-700">
                  {featureGroup.category}
                </td>
              </tr>
              {featureGroup.features.map((feature, featureIndex) => (
                <tr
                  key={`${featureGroup.category}-${feature.name}`}
                  className={`border-b border-slate-100 ${
                    featureIndex % 2 === 0 ? "bg-white" : "bg-slate-50"
                  }`}
                >
                  <td className="px-6 py-4 text-sm text-slate-700">
                    {feature.name}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {feature.starter ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
                    ) : (
                      <Circle className="h-5 w-5 text-slate-300 mx-auto" />
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {feature.growth ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
                    ) : (
                      <Circle className="h-5 w-5 text-slate-300 mx-auto" />
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {feature.enterprise ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
                    ) : (
                      <Circle className="h-5 w-5 text-slate-300 mx-auto" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </tbody>
      </table>
    </div>
  );
}
