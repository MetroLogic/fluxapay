"use client";

import React, { useState, JSX } from "react";
import {
  Search,
  AlertTriangle,
  CheckCircle,
  X,
  Eye,
  Filter,
  FileText,
  Calendar,
  Shield,
  User,
  Globe,
} from "lucide-react";
import toast from "react-hot-toast";
import EmptyState from "@/components/EmptyState";
import {
  useKycSubmissions,
  useKycDetails,
  type KycApplicationShape,
} from "@/hooks/useKycSubmissions";
import { api } from "@/lib/api";

interface StatusConfig {
  color: string;
  bg: string;
  border: string;
  icon: JSX.Element;
  label: string;
}

const AdminKycPage = () => {
  const primaryColor = "oklch(0.205 0 0)";
  const primaryLight = "oklch(0.93 0 0)";

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);

  const { applications, isLoading, mutate } = useKycSubmissions({
    status: statusFilter !== "all" ? statusFilter : undefined,
    limit: 100,
  });
  const { application: selectedApplication } = useKycDetails(selectedMerchantId);

  const getStatusConfig = (status: KycApplicationShape["status"]): StatusConfig => {
    switch (status) {
      case "approved":
        return {
          color: "text-emerald-700",
          bg: "bg-emerald-50",
          border: "border-emerald-200",
          icon: <CheckCircle className="w-3 h-3" />,
          label: "Approved",
        };
      case "pending":
        return {
          color: "text-amber-700",
          bg: "bg-amber-50",
          border: "border-amber-200",
          icon: <Shield className="w-3 h-3" />,
          label: "Pending Review",
        };
      case "rejected":
        return {
          color: "text-rose-700",
          bg: "bg-rose-50",
          border: "border-rose-200",
          icon: <X className="w-3 h-3" />,
          label: "Rejected",
        };
      case "additional_info_required":
        return {
          color: "text-blue-700",
          bg: "bg-blue-50",
          border: "border-blue-200",
          icon: <AlertTriangle className="w-3 h-3" />,
          label: "Add. Info Required",
        };
      default:
        return {
          color: "text-slate-600",
          bg: "bg-slate-50",
          border: "border-slate-200",
          icon: <Shield className="w-3 h-3" />,
          label: status,
        };
    }
  };

  const handleUpdateStatus = async (
    merchantId: string,
    newStatus: "approved" | "rejected",
    rejection_reason?: string
  ) => {
    try {
      await api.kyc.admin.updateStatus(merchantId, {
        status: newStatus,
        rejection_reason,
      });
      toast.success(`Application ${newStatus} successfully`);
      setSelectedMerchantId(null);
      setShowRejectModal(false);
      setRejectionReason("");
      void mutate();
    } catch {
      toast.error("Failed to update application status");
    }
  };

  const handleReject = () => {
    if (!selectedApplication) return;
    if (!rejectionReason.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    void handleUpdateStatus(selectedApplication.merchantId, "rejected", rejectionReason);
  };

  const filteredApplications = applications.filter((app) => {
    const matchesSearch =
      !searchTerm ||
      app.merchantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const getStats = () => {
    const total = applications.length;
    const pending = applications.filter((a) => a.status === "pending").length;
    const approved = applications.filter((a) => a.status === "approved").length;
    const rejected = applications.filter((a) => a.status === "rejected").length;
    return { total, pending, approved, rejected };
  };

  const stats = getStats();

  if (isLoading && applications.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Loading KYC applications...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                KYC Applications
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Review and manage merchant identity verification requests
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">
                  Pending Review
                </p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {stats.pending}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-amber-50">
                <Shield className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Approved</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {stats.approved}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-50">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Rejected</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {stats.rejected}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-rose-50">
                <X className="w-5 h-5 text-rose-600" />
              </div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">
                  Total Applications
                </p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {stats.total}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-slate-100">
                <FileText className="w-5 h-5 text-slate-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by merchant, email..."
                  className="w-full pl-10 pr-4 py-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition-shadow"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <select
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent bg-white"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="pending">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="additional_info_required">
                  Add. Info Required
                </option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Reference ID
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Merchant Info
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Date Submitted
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredApplications.length === 0 ? (
                  <EmptyState
                    colSpan={5}
                    className="py-12"
                    message="No applications found. No KYC applications match your search criteria."
                  />
                ) : (
                  filteredApplications.map((app) => {
                    const statusConfig = getStatusConfig(app.status);
                    return (
                      <tr
                        key={app.id}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-slate-900 font-mono">
                            {app.id}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100">
                              <User className="w-4 h-4 text-slate-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">
                                {app.merchantName}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Globe className="w-3 h-3 text-slate-400" />
                                <p className="text-xs text-slate-500">
                                  {app.country}
                                </p>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            {app.submittedDate}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color} ${statusConfig.border}`}
                          >
                            {statusConfig.icon}
                            {statusConfig.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedMerchantId(app.merchantId)}
                              className="px-3 py-1.5 text-sm font-medium text-white rounded-lg transition-colors hover:opacity-90 flex items-center gap-2"
                              style={{ backgroundColor: primaryColor }}
                            >
                              <Eye className="w-4 h-4" />
                              Review
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Application Detail Modal */}
      {selectedApplication && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full my-8 flex flex-col relative">
            {/* Close Button */}
            <button
              onClick={() => {
                setSelectedMerchantId(null);
                setShowRejectModal(false);
              }}
              className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full transition-colors z-10"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>

            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: primaryLight }}
                >
                  <BuildingIcon
                    className="w-6 h-6"
                    style={{ color: primaryColor }}
                  />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {selectedApplication.merchantName}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-slate-500 font-mono">
                      {selectedApplication.id}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-sm text-slate-500">
                      {selectedApplication.email}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-8">
              {/* Business Information */}
              <section>
                <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">
                  Business Details
                </h3>
                <div className="bg-slate-50 rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">
                      Registration Number
                    </p>
                    <p className="text-sm font-medium text-slate-900">
                      {selectedApplication.businessInfo.registrationNumber}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Entity Type</p>
                    <p className="text-sm font-medium text-slate-900">
                      {selectedApplication.businessInfo.type}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs text-slate-500 mb-1">
                      Business Address
                    </p>
                    <p className="text-sm font-medium text-slate-900">
                      {selectedApplication.businessInfo.address}
                    </p>
                  </div>
                </div>
              </section>

              {/* Beneficial Owners */}
              <section>
                <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">
                  Beneficial Owners
                </h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Role
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Ownership
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {selectedApplication.beneficialOwners.length === 0 ? (
                        <EmptyState
                          colSpan={3}
                          className="px-4 py-8 text-sm text-slate-500"
                          message="No beneficial owners provided."
                        />
                      ) : (
                        selectedApplication.beneficialOwners.map(
                          (owner, idx) => (
                            <tr key={idx}>
                              <td className="px-4 py-3 text-sm text-slate-900">
                                {owner.name}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-600">
                                {owner.role}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-900">
                                {owner.ownership}%
                              </td>
                            </tr>
                          ),
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Documents */}
              <section>
                <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">
                  Submitted Documents
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedApplication.documents.map((doc, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors bg-white"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                          <FileText className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {doc.type}
                          </p>
                          <p className="text-xs text-slate-500">{doc.name}</p>
                        </div>
                      </div>
                      <button className="text-sm text-indigo-600 font-medium hover:text-indigo-700">
                        View
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Actions Footer */}
            <div className="p-6 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              {showRejectModal ? (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-slate-900">
                    Reason for Rejection
                  </p>
                  <textarea
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm"
                    rows={3}
                    placeholder="Please explain why this application is being rejected..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                  ></textarea>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setShowRejectModal(false);
                        setRejectionReason("");
                      }}
                      className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReject}
                      className="px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors"
                    >
                      Confirm Rejection
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() =>
                      handleUpdateStatus(
                        selectedApplication.id,
                        "additional_info_required",
                      )
                    }
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Request Info
                  </button>
                  <button
                    onClick={() => setShowRejectModal(true)}
                    className="px-4 py-2 text-sm font-medium text-rose-700 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() =>
                      handleUpdateStatus(selectedApplication.merchantId, "approved")
                    }
                    className="px-6 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                  >
                    Approve Application
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper component for the modal icon
const BuildingIcon = ({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
    <path d="M9 22v-4h6v4" />
    <path d="M8 6h.01" />
    <path d="M16 6h.01" />
    <path d="M12 6h.01" />
    <path d="M12 10h.01" />
    <path d="M12 14h.01" />
    <path d="M16 10h.01" />
    <path d="M16 14h.01" />
    <path d="M8 10h.01" />
    <path d="M8 14h.01" />
  </svg>
);

export default AdminKycPage;
