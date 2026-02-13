import {
  Shield,
  Lock,
  Eye,
  Server,
  Trash2,
  Users,
  Globe,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';

export function SecurityPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg">
          <Shield className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-bold font-heading text-[var(--app-heading)]">
          Security & Data Protection
        </h1>
        <p className="text-lg text-[var(--app-body)] max-w-2xl mx-auto">
          ReconcileX is built with enterprise-grade security at its core. Your
          financial data deserves the highest level of protection, and we take
          that responsibility seriously.
        </p>
      </div>

      {/* Key Principles - 3 cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-6 text-center space-y-3 border-[var(--app-border)]">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-green-50 text-green-600">
            <Trash2 className="w-6 h-6" />
          </div>
          <h3 className="font-semibold font-heading text-[var(--app-heading)]">
            Zero Data Retention
          </h3>
          <p className="text-sm text-[var(--app-body)]">
            Your financial files are processed in memory and automatically
            deleted immediately after reconciliation. We never store your
            transaction data.
          </p>
        </Card>

        <Card className="p-6 text-center space-y-3 border-[var(--app-border)]">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 text-blue-600">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="font-semibold font-heading text-[var(--app-heading)]">
            Complete Tenant Isolation
          </h3>
          <p className="text-sm text-[var(--app-body)]">
            Every organization's data is isolated through Row Level Security. It
            is technically impossible for one client to access another client's
            data.
          </p>
        </Card>

        <Card className="p-6 text-center space-y-3 border-[var(--app-border)]">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-purple-50 text-purple-600">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="font-semibold font-heading text-[var(--app-heading)]">
            End-to-End Encryption
          </h3>
          <p className="text-sm text-[var(--app-body)]">
            All data is encrypted in transit with TLS 1.3 and at rest with
            AES-256. Your files are protected at every stage of processing.
          </p>
        </Card>
      </div>

      {/* Detailed Sections */}
      <div className="space-y-8">
        {/* Data Processing */}
        <Card className="p-8 border-[var(--app-border)]">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Server className="w-5 h-5" />
            </div>
            <div className="space-y-4">
              <h2 className="text-xl font-semibold font-heading text-[var(--app-heading)]">
                How Your Data Is Processed
              </h2>
              <div className="space-y-3 text-sm text-[var(--app-body)]">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>File Upload:</strong> Your CSV or Excel files are
                    parsed directly in your browser. The raw files are never
                    sent to our servers in their original form.
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>Matching Process:</strong> For large datasets,
                    normalized data is temporarily transferred to our processing
                    servers via encrypted channels, matched, and the temporary
                    data is deleted immediately upon completion.
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>Results Storage:</strong> Only reconciliation
                    metadata is stored (match counts, rates, timestamps).
                    Individual transaction records are never persisted in our
                    database.
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>AI Features:</strong> When AI analysis is used, only
                    the minimum required context is sent to the AI provider. Full
                    datasets are never shared with third parties.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Infrastructure */}
        <Card className="p-8 border-[var(--app-border)]">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Globe className="w-5 h-5" />
            </div>
            <div className="space-y-4">
              <h2 className="text-xl font-semibold font-heading text-[var(--app-heading)]">
                Infrastructure & Hosting
              </h2>
              <div className="space-y-3 text-sm text-[var(--app-body)]">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>Cloud Provider:</strong> Hosted on Vercel (frontend
                    and processing) and Supabase (database and authentication),
                    both SOC 2 Type II certified providers with enterprise-grade
                    infrastructure.
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>Database Security:</strong> PostgreSQL with Row Level
                    Security (RLS) ensures complete data isolation between
                    organizations at the database level.
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>Authentication:</strong> Industry-standard
                    authentication with secure password hashing (bcrypt), session
                    management, and support for password reset flows.
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>Network Security:</strong> All endpoints are served
                    over HTTPS with TLS 1.3. HTTP Strict Transport Security
                    (HSTS) headers are enforced.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Access Controls */}
        <Card className="p-8 border-[var(--app-border)]">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Eye className="w-5 h-5" />
            </div>
            <div className="space-y-4">
              <h2 className="text-xl font-semibold font-heading text-[var(--app-heading)]">
                Access Controls & Privacy
              </h2>
              <div className="space-y-3 text-sm text-[var(--app-body)]">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>Organization-Based Access:</strong> Users are bound
                    to their organization. All data queries are automatically
                    filtered by organization ID through database-level policies.
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>No Cross-Tenant Access:</strong> There is no
                    administrative interface that allows viewing another
                    organization's financial data. Row Level Security makes
                    cross-tenant data access impossible even at the database
                    query level.
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>Minimal Data Collection:</strong> We only store
                    what's necessary to provide the service — account
                    credentials, reconciliation history metadata, and user
                    preferences. We do not sell, share, or monetize your data.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Compliance Roadmap */}
        <Card className="p-8 border-[var(--app-border)]">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
              <FileCheck className="w-5 h-5" />
            </div>
            <div className="space-y-4">
              <h2 className="text-xl font-semibold font-heading text-[var(--app-heading)]">
                Compliance & Certifications
              </h2>
              <div className="space-y-3 text-sm text-[var(--app-body)]">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>Infrastructure Compliance:</strong> Our cloud
                    providers (Vercel and Supabase) maintain SOC 2 Type II, ISO
                    27001, and GDPR compliance certifications.
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>GDPR Ready:</strong> ReconcileX is designed with data
                    minimization principles. Users can request data export or
                    deletion of their account and associated metadata at any
                    time.
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-4 h-4 rounded-full border-2 border-blue-400 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>SOC 2 Type II (Planned):</strong> ReconcileX is
                    actively preparing for SOC 2 Type II certification to provide
                    the highest level of assurance for enterprise clients.
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-4 h-4 rounded-full border-2 border-blue-400 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>Bring Your Own Cloud (Planned):</strong> For
                    organizations with strict data residency requirements, our
                    upcoming BYOC feature will allow you to connect your own
                    cloud storage (AWS S3, Azure Blob, Google Cloud Storage) so
                    your data never leaves your infrastructure.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Contact Section */}
        <Card className="p-8 border-[var(--app-border)] bg-gradient-to-br from-gray-50 to-blue-50/30">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100 text-blue-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-semibold font-heading text-[var(--app-heading)]">
              Security Questions or Concerns?
            </h2>
            <p className="text-sm text-[var(--app-body)] max-w-xl mx-auto">
              We take security seriously and welcome any questions from your IT
              or compliance teams. For security inquiries, vulnerability
              reports, or to request our detailed security documentation, please
              contact us.
            </p>
            <p className="text-sm font-medium text-[var(--app-primary)]">
              security@reconcilex.com
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
