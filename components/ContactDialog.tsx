import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Users, Phone, AlertCircle, CheckCircle } from 'lucide-react';
import { Contact } from '../types';
import { contactsApi } from '../services/api';

interface Props {
  onClose: () => void;
  onContactSelect?: (contacts: Contact[]) => void;
  mode?: 'manage' | 'select';
  multiSelect?: boolean;
}

export const ContactDialog: React.FC<Props> = ({ onClose, onContactSelect, mode = 'manage', multiSelect = false }) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    name: '',
    phoneNumber: '',
    isSaved: false
  });

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      setLoading(true);
      const contactsData = await contactsApi.getAll();
      setContacts(contactsData.map(c => ({
        ...c,
        createdAt: new Date(c.createdAt).getTime(),
        updatedAt: new Date(c.updatedAt).getTime(),
        lastShared: c.lastShared ? new Date(c.lastShared).getTime() : undefined
      })));
    } catch (error) {
      console.error('Failed to load contacts:', error);
      alert('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateContact = async () => {
    if (!formData.name.trim() || !formData.phoneNumber.trim()) {
      alert('Please enter name and phone number');
      return;
    }

    try {
      setLoading(true);
      if (editingContact) {
        await contactsApi.update(editingContact.id, {
          name: formData.name,
          phoneNumber: formData.phoneNumber,
          isSaved: formData.isSaved
        });
      } else {
        await contactsApi.create({
          name: formData.name,
          phoneNumber: formData.phoneNumber,
          isSaved: formData.isSaved
        });
      }
      await loadContacts();
      setShowCreateForm(false);
      setEditingContact(null);
      setFormData({ name: '', phoneNumber: '', isSaved: false });
    } catch (error: any) {
      alert('Failed to save contact: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    try {
      await contactsApi.delete(id);
      await loadContacts();
    } catch (error: any) {
      alert('Failed to delete contact: ' + (error.message || 'Unknown error'));
    }
  };

  const handleEditContact = (contact: Contact) => {
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      phoneNumber: contact.phoneNumber,
      isSaved: contact.isSaved
    });
    setShowCreateForm(true);
  };

  const toggleSelectContact = (id: string) => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedContacts.size === contacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(contacts.map(c => c.id)));
    }
  };

  const handleConfirmSelection = () => {
    if (onContactSelect && selectedContacts.size > 0) {
      const selected = contacts.filter(c => selectedContacts.has(c.id));
      onContactSelect(selected);
      onClose();
    }
  };

  if (mode === 'select' && !showCreateForm) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Select Contacts</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>
          <div className="p-4 border-b flex items-center justify-between">
            <button
              onClick={handleSelectAll}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              {selectedContacts.size === contacts.length ? 'Deselect All' : 'Select All'}
            </button>
            <span className="text-sm text-gray-500">
              {selectedContacts.size} selected
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading contacts...</div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-4">No contacts found</p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-medium"
                >
                  Add Contact
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {contacts.map(contact => (
                  <button
                    key={contact.id}
                    onClick={() => toggleSelectContact(contact.id)}
                    className={`w-full p-3 rounded-xl border-2 text-left transition-all ${
                      selectedContacts.has(contact.id)
                        ? 'border-indigo-600 bg-indigo-50'
                        : 'border-gray-200 bg-white hover:border-indigo-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-bold text-sm text-gray-900">{contact.name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{contact.phoneNumber}</p>
                        {contact.deliveryStatus === 'undelivered' && (
                          <span className="inline-block mt-1 text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded">
                            Not Delivered
                          </span>
                        )}
                      </div>
                      {selectedContacts.has(contact.id) && (
                        <CheckCircle className="w-5 h-5 text-indigo-600" />
                      )}
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="w-full p-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition-all text-sm font-medium"
                >
                  + Add New Contact
                </button>
              </div>
            )}
          </div>
          {selectedContacts.size > 0 && (
            <div className="p-4 border-t">
              <button
                onClick={handleConfirmSelection}
                className="w-full px-4 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700"
              >
                Select {selectedContacts.size} Contact{selectedContacts.size !== 1 ? 's' : ''}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {editingContact ? 'Edit Contact' : 'Add Contact'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Contact Name</label>
            <input
              type="text"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="e.g., John Doe"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="tel"
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="e.g., 919876543210 (with country code)"
                value={formData.phoneNumber}
                onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Enter phone number with country code (e.g., 919876543210 for India)
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isSaved"
              checked={formData.isSaved}
              onChange={e => setFormData({ ...formData, isSaved: e.target.checked })}
              className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
            />
            <label htmlFor="isSaved" className="text-sm font-medium text-gray-700">
              This contact has saved my number (message will be delivered)
            </label>
          </div>
        </div>

        <div className="p-6 bg-gray-50 border-t flex gap-3">
          <button
            onClick={() => {
              setShowCreateForm(false);
              setEditingContact(null);
              setFormData({ name: '', phoneNumber: '', isSaved: false });
            }}
            className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateContact}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving...' : editingContact ? 'Update Contact' : 'Add Contact'}
          </button>
        </div>
      </div>
    </div>
  );
};
