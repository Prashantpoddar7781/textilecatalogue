import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Users, Phone } from 'lucide-react';
import { Group, GroupMember } from '../types';
import { groupsApi } from '../services/api';

interface Props {
  onClose: () => void;
  onGroupSelect?: (group: Group) => void;
  mode?: 'manage' | 'select';
}

export const GroupDialog: React.FC<Props> = ({ onClose, onGroupSelect, mode = 'manage' }) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    members: [{ name: '', phoneNumber: '' }] as { name: string; phoneNumber: string }[]
  });

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      setLoading(true);
      const groupsData = await groupsApi.getAll();
      setGroups(groupsData.map(g => ({
        ...g,
        createdAt: new Date(g.createdAt).getTime(),
        updatedAt: new Date(g.updatedAt).getTime()
      })));
    } catch (error) {
      console.error('Failed to load groups:', error);
      alert('Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!formData.name.trim()) {
      alert('Please enter a group name');
      return;
    }

    const validMembers = formData.members.filter(m => m.name.trim() && m.phoneNumber.trim());
    if (validMembers.length === 0) {
      alert('Please add at least one member');
      return;
    }

    try {
      setLoading(true);
      if (editingGroup) {
        await groupsApi.update(editingGroup.id, {
          name: formData.name,
          members: validMembers
        });
      } else {
        await groupsApi.create({
          name: formData.name,
          members: validMembers
        });
      }
      await loadGroups();
      setShowCreateForm(false);
      setEditingGroup(null);
      setFormData({ name: '', members: [{ name: '', phoneNumber: '' }] });
    } catch (error: any) {
      alert('Failed to save group: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (!confirm('Are you sure you want to delete this group?')) return;
    try {
      await groupsApi.delete(id);
      await loadGroups();
    } catch (error: any) {
      alert('Failed to delete group: ' + (error.message || 'Unknown error'));
    }
  };

  const handleEditGroup = (group: Group) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      members: group.members.length > 0 
        ? group.members.map(m => ({ name: m.name, phoneNumber: m.phoneNumber }))
        : [{ name: '', phoneNumber: '' }]
    });
    setShowCreateForm(true);
  };

  const addMemberField = () => {
    setFormData({
      ...formData,
      members: [...formData.members, { name: '', phoneNumber: '' }]
    });
  };

  const removeMemberField = (index: number) => {
    setFormData({
      ...formData,
      members: formData.members.filter((_, i) => i !== index)
    });
  };

  const updateMember = (index: number, field: 'name' | 'phoneNumber', value: string) => {
    const newMembers = [...formData.members];
    newMembers[index] = { ...newMembers[index], [field]: value };
    setFormData({ ...formData, members: newMembers });
  };

  if (mode === 'select' && !showCreateForm) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Select Group</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>
          <div className="p-6 max-h-96 overflow-y-auto">
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading groups...</div>
            ) : groups.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-4">No groups found</p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-medium"
                >
                  Create Group
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {groups.map(group => (
                  <button
                    key={group.id}
                    onClick={() => {
                      if (onGroupSelect) onGroupSelect(group);
                      onClose();
                    }}
                    className="w-full p-4 bg-gray-50 hover:bg-indigo-50 border-2 border-transparent hover:border-indigo-200 rounded-xl transition-all text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-gray-900">{group.name}</h3>
                        <p className="text-xs text-gray-500 mt-1">
                          {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
                        </p>
                      </div>
                      <Users className="w-5 h-5 text-indigo-600" />
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="w-full p-4 border-2 border-dashed border-gray-300 hover:border-indigo-400 rounded-xl text-gray-600 hover:text-indigo-600 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  <span className="font-medium">Create New Group</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {editingGroup ? 'Edit Group' : 'Create New Group'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Group Name</label>
            <input
              type="text"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="e.g., Wholesale Customers, Retail Partners"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-semibold text-gray-700">Group Members</label>
              <button
                type="button"
                onClick={addMemberField}
                className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Add Member
              </button>
            </div>
            <div className="space-y-3">
              {formData.members.map((member, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="Name"
                      value={member.name}
                      onChange={e => updateMember(index, 'name', e.target.value)}
                    />
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="tel"
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Phone (e.g., 9123456789)"
                        value={member.phoneNumber}
                        onChange={e => updateMember(index, 'phoneNumber', e.target.value)}
                      />
                    </div>
                  </div>
                  {formData.members.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMemberField(index)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-xl"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Enter phone numbers with country code (e.g., 919876543210 for India)
            </p>
          </div>
        </div>

        <div className="p-6 bg-gray-50 border-t flex gap-3">
          <button
            onClick={() => {
              setShowCreateForm(false);
              setEditingGroup(null);
              setFormData({ name: '', members: [{ name: '', phoneNumber: '' }] });
            }}
            className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateGroup}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving...' : editingGroup ? 'Update Group' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
};
