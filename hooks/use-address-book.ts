import { useState, useEffect } from 'react';

export interface Contact {
  id: string;
  name: string;
  address: string;
}

const STORAGE_KEY = 'stellar-batch-pay-address-book';

export function useAddressBook() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setContacts(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse address book:', e);
      }
    }
    setIsLoading(false);
  }, []);

  const saveContacts = (newContacts: Contact[]) => {
    setContacts(newContacts);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newContacts));
  };

  const addContact = (name: string, address: string) => {
    const newContact: Contact = {
      id: crypto.randomUUID(),
      name,
      address,
    };
    saveContacts([...contacts, newContact]);
  };

  const updateContact = (id: string, name: string, address: string) => {
    saveContacts(
      contacts.map((c) => (c.id === id ? { ...c, name, address } : c))
    );
  };

  const deleteContact = (id: string) => {
    saveContacts(contacts.filter((c) => c.id !== id));
  };

  const exportContacts = () => {
    const dataStr = JSON.stringify(contacts, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = 'stellar-batch-pay-contacts.json';

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const importContacts = (jsonStr: string) => {
    try {
      const imported = JSON.parse(jsonStr);
      if (Array.isArray(imported)) {
        // Basic validation
        const valid = imported.every(
          (c) => typeof c.name === 'string' && typeof c.address === 'string'
        );
        if (valid) {
          const merged = [...contacts];
          imported.forEach((newContact) => {
            if (!merged.find((m) => m.address === newContact.address)) {
              merged.push({
                id: newContact.id || crypto.randomUUID(),
                name: newContact.name,
                address: newContact.address,
              });
            }
          });
          saveContacts(merged);
          return true;
        }
      }
      return false;
    } catch (e) {
      console.error('Failed to import contacts:', e);
      return false;
    }
  };

  return {
    contacts,
    isLoading,
    addContact,
    updateContact,
    deleteContact,
    exportContacts,
    importContacts,
  };
}
