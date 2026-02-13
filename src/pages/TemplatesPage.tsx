/*
SQL to run in Supabase Dashboard → SQL Editor:

CREATE TABLE matching_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  config JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE matching_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view templates in their org"
  ON matching_templates FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert templates in their org"
  ON matching_templates FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update templates in their org"
  ON matching_templates FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete templates in their org"
  ON matching_templates FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));
*/

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Bookmark, FileText, Pencil, Trash2 } from 'lucide-react';
import { BUILT_IN_TEMPLATES } from '@/features/matching-rules/templates';
import {
  getTemplates,
  updateTemplate,
  deleteTemplate,
  type MatchingTemplateRow,
} from '@/lib/database';
import type { MatchingConfig } from '@/features/reconciliation/types';

const headingStyle = { fontFamily: 'var(--font-heading)' };

function getRulesSummary(config: MatchingConfig): string[] {
  return config.rules.map((r) => {
    const type = r.matchType.replace(/_/g, ' ');
    return `${r.columnA} ↔ ${r.columnB} (${type})`;
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function TemplatesPage() {
  const { organizationId } = useAuth();
  const [customTemplates, setCustomTemplates] = useState<MatchingTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MatchingTemplateRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<MatchingTemplateRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!organizationId) {
      setCustomTemplates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    getTemplates(organizationId)
      .then(setCustomTemplates)
      .finally(() => setLoading(false));
  }, [organizationId]);

  const openEditDialog = (template: MatchingTemplateRow) => {
    setEditingTemplate(template);
    setEditName(template.name);
    setEditDescription(template.description ?? '');
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingTemplate) return;
    setEditSaving(true);
    const ok = await updateTemplate(editingTemplate.id, {
      name: editName.trim(),
      description: editDescription.trim() || undefined,
    });
    setEditSaving(false);
    if (ok) {
      setEditDialogOpen(false);
      setEditingTemplate(null);
      if (organizationId) {
        const updated = await getTemplates(organizationId);
        setCustomTemplates(updated);
      }
    }
  };

  const openDeleteDialog = (template: MatchingTemplateRow) => {
    setDeletingTemplate(template);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingTemplate) return;
    setDeleteLoading(true);
    const ok = await deleteTemplate(deletingTemplate.id);
    setDeleteLoading(false);
    if (ok) {
      setDeleteDialogOpen(false);
      setCustomTemplates((prev) => prev.filter((t) => t.id !== deletingTemplate.id));
      setDeletingTemplate(null);
    }
  };

  return (
    <div className="space-y-8 pb-8">
      <div>
        <h1 className="text-3xl font-bold font-heading text-[var(--app-heading)] mb-8" style={headingStyle}>
          Templates
        </h1>
        <p className="mt-1 text-base text-[var(--app-body)]">
          Save and reuse matching rule configurations
        </p>
      </div>

      {/* Built-in Templates */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-[var(--app-heading)]" style={headingStyle}>
          Built-in Templates
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {BUILT_IN_TEMPLATES.map((template) => {
            const summary = getRulesSummary(template.config);
            const rulesCount = template.config.rules.length;
            const minConf = Math.round((template.config.minConfidenceThreshold ?? 0) * 100);
            return (
              <Card
                key={template.id}
                className="border-[var(--app-border)] bg-white transition-shadow hover:shadow-md"
              >
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base" style={headingStyle}>
                        {template.name}
                      </CardTitle>
                      <Badge variant="secondary" className="text-xs font-normal">
                        Built-in
                      </Badge>
                    </div>
                    <CardDescription className="mt-1 text-[var(--app-body)]">
                      {template.description ?? 'No description'}
                    </CardDescription>
                  </div>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--app-primary)]/10 text-[var(--app-primary)]">
                    <Bookmark className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-[var(--app-body)]">
                    {rulesCount} rule{rulesCount !== 1 ? 's' : ''}: {summary.slice(0, 3).join(', ')}
                    {summary.length > 3 && ` +${summary.length - 3} more`}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {template.config.matchingType === 'oneToOne' ? '1:1' : 'Group'}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Min confidence: {minConf}%
                    </Badge>
                  </div>
                  <Link to="/reconciliation/new">
                    <Button size="sm">Use Template</Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Custom Templates */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-[var(--app-heading)]" style={headingStyle}>
          Custom Templates
        </h2>
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-[var(--app-border)] bg-white">
                <CardHeader>
                  <div className="h-5 w-48 rounded bg-muted animate-pulse" />
                  <div className="mt-2 h-4 w-full rounded bg-muted animate-pulse" />
                  <div className="mt-2 h-4 w-3/4 rounded bg-muted animate-pulse" />
                </CardHeader>
                <CardContent>
                  <div className="h-9 w-24 rounded bg-muted animate-pulse" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : customTemplates.length === 0 ? (
          <Card className="border-[var(--app-border)] bg-white">
            <CardContent className="flex flex-col items-center justify-center py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--app-bg-subtle)] text-[var(--app-body)]">
                <FileText className="h-7 w-7" />
              </div>
              <p className="mt-4 max-w-sm text-[var(--app-body)]">
                No custom templates yet. Save a template from the Matching Rules step during a
                reconciliation.
              </p>
              <Link to="/reconciliation/new" className="mt-4">
                <Button>Start Reconciliation</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {customTemplates.map((template) => {
              const summary = getRulesSummary(template.config);
              const rulesCount = template.config.rules.length;
              const minConf = Math.round((template.config.minConfidenceThreshold ?? 0) * 100);
              return (
                <Card
                  key={template.id}
                  className="border-[var(--app-border)] border-l-4 border-l-[var(--app-primary)] bg-white transition-shadow hover:shadow-md"
                >
                  <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                    <div>
                      <CardTitle className="text-base" style={headingStyle}>
                        {template.name}
                      </CardTitle>
                      <CardDescription className="mt-1 text-[var(--app-body)]">
                        {template.description || 'No description'}
                      </CardDescription>
                    </div>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--app-body)]/10 text-[var(--app-body)]">
                      <FileText className="h-4 w-4" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-[var(--app-body)]">
                      {rulesCount} rule{rulesCount !== 1 ? 's' : ''}: {summary.slice(0, 3).join(', ')}
                      {summary.length > 3 && ` +${summary.length - 3} more`}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {template.config.matchingType === 'oneToOne' ? '1:1' : 'Group'}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Min confidence: {minConf}%
                      </Badge>
                      <span className="text-xs text-[var(--app-body)]">
                        Created {formatDate(template.created_at)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link to="/reconciliation/new">
                        <Button size="sm">Use Template</Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditDialog(template)}
                        aria-label="Edit template"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => openDeleteDialog(template)}
                        aria-label="Delete template"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={headingStyle}>Edit Template</DialogTitle>
            <DialogDescription>
              Update the template name and description.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Template name"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Input
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional description"
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={editSaving}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={!editName.trim() || editSaving}>
              {editSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={headingStyle}>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingTemplate?.name}&quot;? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleteLoading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteLoading}
            >
              {deleteLoading ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
