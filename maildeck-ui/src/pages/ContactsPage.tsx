import { fetchAuthSession } from 'aws-amplify/auth';
import axios from 'axios';
import { useEffect, useState } from 'react';
import ComposeModal, { type Account } from '../components/ComposeModal';
import ContactModal from '../components/ContactModal';
import { getServerConfigs, updateContact } from '../lib/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface Contact {
    id: string;
    name: string;
    email: string;
}

export default function ContactsPage() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);
    const [isComposeOpen, setIsComposeOpen] = useState(false);
    const [composeTo, setComposeTo] = useState('');
    const [accounts, setAccounts] = useState<Account[]>([]);

    const fetchContacts = async () => {
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.accessToken?.toString();
            if (!token) return;

            const res = await axios.get(`${API_BASE}/contacts`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setContacts(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchContacts();
        getServerConfigs().then(setAccounts).catch(console.error);
    }, []);

    const handleSaveContact = async (name: string, email: string) => {
        if (editingContact) {
            try {
                await updateContact(editingContact.id, name, email);
                alert('連絡先を更新しました');
                setEditingContact(null);
                await fetchContacts();
            } catch (err) {
                console.error(err);
                alert('更新失敗');
            }
        } else {
            const session = await fetchAuthSession();
            const token = session.tokens?.accessToken?.toString();

            await axios.post(`${API_BASE}/contacts`, { name, email }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            await fetchContacts();
        }
    };

    const openCreateModal = () => {
        setEditingContact(null);
        setIsModalOpen(true);
    };

    const openEditModal = (contact: Contact) => {
        setEditingContact(contact);
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('本当に削除しますか？')) return;

        const session = await fetchAuthSession();
        const token = session.tokens?.accessToken?.toString();

        try {
            await axios.delete(`${API_BASE}/contacts/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setContacts(contacts.filter(c => c.id !== id));
        } catch (err) {
            alert('削除に失敗しました');
        }
    };

    const handleSendMail = async (to: string, subject: string, body: string, configId: string) => {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();

        if (!token) {
            alert('認証エラー: ログインし直してください。');
            return;
        }

        try {
            await axios.post(`${API_BASE}/mail/send`, {
                to,
                subject,
                body,
                configId
            }, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            alert('メールを送信しました！');
            setIsComposeOpen(false);
        } catch (error) {
            console.error(error);
            alert('送信失敗');
        }
    };

    const openCompose = (email: string) => {
        setComposeTo(email);
        setIsComposeOpen(true);
    };

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">連絡先</h1>
                <button
                    onClick={openCreateModal}
                    className="bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 shadow-sm font-medium flex items-center gap-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    追加
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">読み込み中...</div>
                ) : contacts.length === 0 ? (
                    <div className="p-12 text-center text-gray-500 bg-gray-50 m-4 rounded-lg border border-dashed border-gray-300">
                        <p>連絡先がまだありません。</p>
                        <button onClick={openCreateModal} className="text-brand-600 hover:text-brand-700 font-medium mt-2">
                            最初の連絡先を追加
                        </button>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50/50 border-b border-gray-100">
                            <tr>
                                <th className="text-left p-4 font-medium text-gray-500 text-sm">名前</th>
                                <th className="text-left p-4 font-medium text-gray-500 text-sm">メールアドレス</th>
                                <th className="text-right p-4 font-medium text-gray-500 text-sm">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {contacts.map(contact => (
                                <tr key={contact.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-4 font-medium text-gray-900">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-xs">
                                                {contact.name[0]}
                                            </div>
                                            {contact.name}
                                        </div>
                                    </td>
                                    <td className="p-4 text-gray-600">{contact.email}</td>
                                    <td className="p-4 text-right">
                                        <button
                                            onClick={() => openEditModal(contact)}
                                            className="text-gray-400 hover:text-brand-600 transition-colors p-2 rounded-full hover:bg-brand-50 mr-1"
                                            title="編集"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => openCompose(contact.email)}
                                            className="text-gray-400 hover:text-brand-600 transition-colors p-2 rounded-full hover:bg-brand-50 mr-1"
                                            title="メール送信"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => handleDelete(contact.id)}
                                            className="text-gray-400 hover:text-red-600 transition-colors p-2 rounded-full hover:bg-red-50"
                                            title="削除"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                            </svg>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <ContactModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveContact}
                initialData={editingContact}
            />

            <ComposeModal
                isOpen={isComposeOpen}
                onClose={() => setIsComposeOpen(false)}
                onSend={handleSendMail}
                accounts={accounts}
                initialTo={composeTo}
            />
        </div>
    );
}
