import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Plus, Save, Trash2, Users } from 'lucide-react';
import { erpUsersApi } from '../services/api';
import { accessLevelLabel } from '../services/erpSession';
import { ErpAccessLevel, ErpUserAccount } from '../types';

interface Props {
  onBack: () => void;
}

const emptyForm = {
  name: '',
  password: '',
  accessLevel: 'data_entry' as ErpAccessLevel
};

export const ErpUserManagementPage: React.FC<Props> = ({ onBack }) => {
  const [users, setUsers] = useState<ErpUserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPassword, setEditPassword] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const { users: fetched } = await erpUsersApi.getAll();
      setUsers(fetched || []);
    } catch (err: any) {
      setError(err.message || 'Could not load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await erpUsersApi.create({
        name: form.name.trim(),
        password: form.password,
        accessLevel: form.accessLevel
      });
      const wasEmpty = users.length === 0;
      setForm(emptyForm);
      await loadUsers();
      // After first user exists, owner bypass must not keep skipping ERP login
      try {
        const raw = sessionStorage.getItem('erp_session');
        if (raw) {
          const session = JSON.parse(raw);
          if (session?.bypass) sessionStorage.removeItem('erp_session');
        }
      } catch { /* ignore */ }
      if (wasEmpty) {
        window.location.href = '/erp';
        return;
      }
    } catch (err: any) {
      setError(err.message || 'Could not create user.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (user: ErpUserAccount) => {
    setEditingId(user.id);
    setEditPassword('');
    setForm({
      name: user.name,
      password: '',
      accessLevel: user.accessLevel
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditPassword('');
    setForm(emptyForm);
  };

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setError('');
    try {
      await erpUsersApi.update(editingId, {
        name: form.name.trim(),
        accessLevel: form.accessLevel,
        ...(editPassword.trim() ? { password: editPassword } : {})
      });
      cancelEdit();
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Could not update user.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this ERP user?')) return;
    setError('');
    try {
      await erpUsersApi.delete(id);
      if (editingId === id) cancelEdit();
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Could not delete user.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <header className="sticky top-0 z-30 border-b bg-white/95 px-4 py-3 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            Utilities
          </button>
          <h1 className="text-lg font-black text-gray-900">User Management</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        <section className="mb-6 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-700">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900">{editingId ? 'Edit User' : 'Create User ID'}</h2>
              <p className="text-sm text-gray-500">
                Name, access level, and password. One company account can have multiple ERP users.
              </p>
            </div>
          </div>

          <form onSubmit={editingId ? handleUpdate : handleCreate} className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500">Name</span>
              <input
                className="w-full rounded-xl border bg-gray-50 px-3 py-2.5 text-sm font-semibold"
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="User name / ID"
                required
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500">Access</span>
              <select
                className="w-full rounded-xl border bg-gray-50 px-3 py-2.5 text-sm font-semibold"
                value={form.accessLevel}
                onChange={e => setForm(prev => ({ ...prev, accessLevel: e.target.value as ErpAccessLevel }))}
              >
                <option value="data_entry">Data Entry</option>
                <option value="complete_access">Complete Access</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500">
                {editingId ? 'New Password (optional)' : 'Password'}
              </span>
              <input
                type="password"
                className="w-full rounded-xl border bg-gray-50 px-3 py-2.5 text-sm font-semibold"
                value={editingId ? editPassword : form.password}
                onChange={e => {
                  if (editingId) setEditPassword(e.target.value);
                  else setForm(prev => ({ ...prev, password: e.target.value }));
                }}
                placeholder={editingId ? 'Leave blank to keep' : 'Password'}
                required={!editingId}
                minLength={editingId && !editPassword ? undefined : 4}
              />
            </label>

            <div className="flex gap-2 md:col-span-3">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editingId ? 'Save Changes' : 'Create User'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-xl border px-4 py-2.5 text-sm font-bold text-gray-700"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="mt-4 grid gap-2 text-xs text-gray-500 sm:grid-cols-2">
            <p><span className="font-bold text-gray-700">Data Entry:</span> can make all ERP entries (sales, purchase, bank, notes).</p>
            <p><span className="font-bold text-gray-700">Complete Access:</span> entries plus reports and full ERP utilities.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-wide text-gray-900">ERP Users</h3>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading users...
            </div>
          ) : users.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-400">
              No ERP users yet. Until you create one, ERP opens without a login.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b text-xs uppercase text-gray-500">
                  <tr>
                    <th className="py-2">Name</th>
                    <th>Access</th>
                    <th>Password</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} className="border-b">
                      <td className="py-3 font-semibold text-gray-900">{user.name}</td>
                      <td>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                          user.accessLevel === 'complete_access'
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {accessLevelLabel(user.accessLevel)}
                        </span>
                      </td>
                      <td className="text-xs text-gray-400">••••••••</td>
                      <td className="py-3 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(user)}
                            className="rounded-lg border px-3 py-1.5 text-xs font-bold text-gray-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(user.id)}
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
