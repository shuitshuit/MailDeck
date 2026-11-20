import { useEffect, useRef, useState } from 'react';
import {
    createGoogleCalendarEvent,
    createGoogleTask,
    createMailLink,
    getGoogleIntegration,
    GoogleIntegrationRequiredError,
    startGoogleIntegration,
} from '../lib/api';
import type { GoogleIntegrationStatus } from '../lib/api';
import {
    blankCandidate,
    extractScheduleCandidates,
    toDateInput,
    toLocalDateTimeInput,
} from '../utils/eventExtractor';
import type { ScheduleCandidate, ScheduleKind } from '../utils/eventExtractor';
import { useToast } from '../contexts/ToastContext';

export interface ScheduleSourceMail {
    subject: string;
    bodyText: string;
    bodyHtml?: string;
    date: string;
    messageIdHeader?: string | null;
}

interface ScheduleExtractModalProps {
    isOpen: boolean;
    onClose: () => void;
    configId: string;
    mail: ScheduleSourceMail;
}

type RowStatus = 'idle' | 'saving' | 'done' | 'error';

interface Row {
    id: string;
    kind: ScheduleKind;
    title: string;
    allDay: boolean;
    /** "yyyy-MM-ddTHH:mm" or "yyyy-MM-dd" (allDay) */
    start: string;
    end: string;
    location: string;
    notes: string;
    status: RowStatus;
    htmlLink?: string | null;
}

function toRow(c: ScheduleCandidate): Row {
    return {
        id: c.id,
        kind: c.kind,
        title: c.title,
        allDay: c.allDay,
        start: c.allDay ? toDateInput(c.start) : toLocalDateTimeInput(c.start),
        end: c.end ? (c.allDay ? toDateInput(c.end) : toLocalDateTimeInput(c.end)) : '',
        location: c.location ?? '',
        notes: c.sourceText,
        status: 'idle',
    };
}

function htmlToText(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style').forEach(el => el.remove());
    // ブロック要素の境界を改行にしないと、行単位の判定 (締切/場所) が効かない
    doc.querySelectorAll('br,p,div,tr,li,h1,h2,h3,h4,h5,h6').forEach(el => el.append('\n'));
    return doc.body.textContent ?? '';
}

function switchAllDay(value: string, allDay: boolean): string {
    if (!value) return value;
    return allDay ? value.slice(0, 10) : value.length === 10 ? `${value}T09:00` : value;
}

export default function ScheduleExtractModal({ isOpen, onClose, configId, mail }: ScheduleExtractModalProps) {
    const toast = useToast();
    const [rows, setRows] = useState<Row[]>([]);
    const [integration, setIntegration] = useState<GoogleIntegrationStatus | null>(null);
    const mailLinkRef = useRef<Promise<string | null> | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        const referenceDate = mail.date ? new Date(mail.date) : new Date();
        const bodyText = mail.bodyText?.trim() ? mail.bodyText : htmlToText(mail.bodyHtml ?? '');
        const candidates = extractScheduleCandidates({ subject: mail.subject, bodyText, referenceDate });
        setRows((candidates.length > 0 ? candidates : [blankCandidate(mail.subject, referenceDate)]).map(toRow));
        mailLinkRef.current = null;

        getGoogleIntegration()
            .then(setIntegration)
            .catch(err => {
                console.error('Failed to load Google integration status', err);
                setIntegration({ available: false, connected: false });
            });
    }, [isOpen, mail]);

    useEffect(() => {
        if (!isOpen) return;
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                // 親のメール詳細モーダルまで閉じないようにする
                e.stopImmediatePropagation();
                onClose();
            }
        };
        document.addEventListener('keydown', handleEscape, true);
        return () => document.removeEventListener('keydown', handleEscape, true);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const updateRow = (id: string, patch: Partial<Row>) =>
        setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));

    const addManualRow = () => {
        const referenceDate = mail.date ? new Date(mail.date) : new Date();
        setRows(prev => [...prev, toRow(blankCandidate(mail.subject, referenceDate))]);
    };

    /** 元メールへのリンク。1回だけ作り、失敗したらリンクなしで登録を続ける */
    const getMailLinkUrl = (): Promise<string | null> => {
        if (!mail.messageIdHeader) return Promise.resolve(null);
        mailLinkRef.current ??= createMailLink(configId, mail.messageIdHeader, mail.subject)
            .then(link => link.url)
            .catch(err => {
                console.error('Failed to create mail link', err);
                mailLinkRef.current = null;
                return null;
            });
        return mailLinkRef.current;
    };

    const handleConnect = async () => {
        try {
            window.location.href = await startGoogleIntegration();
        } catch (err) {
            console.error(err);
            toast.error('Google連携を開始できませんでした');
        }
    };

    const handleRegister = async (row: Row) => {
        if (!row.title.trim()) {
            toast.error('タイトルを入力してください');
            return;
        }
        if (!row.start) {
            toast.error(row.kind === 'event' ? '開始日時を入力してください' : '期限を入力してください');
            return;
        }

        updateRow(row.id, { status: 'saving' });
        try {
            const url = await getMailLinkUrl();
            const timeNote = row.kind === 'todo' && !row.allDay ? `時刻: ${row.start.slice(11, 16)}` : '';
            const notes = [row.notes.trim(), timeNote, url ? `元メール: ${url}` : '']
                .filter(Boolean)
                .join('\n\n');

            const created = row.kind === 'event'
                ? await createGoogleCalendarEvent({
                    title: row.title.trim(),
                    start: row.start,
                    end: row.end || null,
                    allDay: row.allDay,
                    location: row.location.trim() || null,
                    notes,
                })
                : await createGoogleTask({
                    title: row.title.trim(),
                    due: row.start.slice(0, 10),
                    notes,
                });

            updateRow(row.id, { status: 'done', htmlLink: created.htmlLink });
            toast.success(row.kind === 'event' ? 'Googleカレンダーに追加しました' : 'Google ToDoに追加しました');
        } catch (err) {
            updateRow(row.id, { status: 'error' });
            if (err instanceof GoogleIntegrationRequiredError) {
                setIntegration(prev => ({ available: prev?.available ?? true, connected: false }));
                toast.error('Googleとの連携が切れています。再連携してください');
            } else {
                console.error(err);
                toast.error('登録に失敗しました');
            }
        }
    };

    const connected = integration?.connected === true;
    const inputClass = 'w-full border border-gray-300 rounded-md px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

    return (
        <div
            className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4"
            onClick={e => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-white shadow-xl w-full max-w-2xl h-[90dvh] md:h-auto md:max-h-[85vh] flex flex-col rounded-t-2xl md:rounded-lg">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h2 className="text-lg font-semibold text-gray-800">予定・ToDoに追加</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center" title="閉じる">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {integration && !connected && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                            {integration.available ? (
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                                    <span>登録するにはGoogleカレンダー / ToDoとの連携が必要です。</span>
                                    <button
                                        onClick={handleConnect}
                                        className="shrink-0 rounded-md bg-brand-600 px-3 py-2 text-white hover:bg-brand-700"
                                    >
                                        Googleと連携
                                    </button>
                                </div>
                            ) : (
                                <span>このサーバーではGoogle連携が設定されていません。</span>
                            )}
                        </div>
                    )}
                    {connected && integration?.email && (
                        <p className="text-xs text-gray-500">登録先: {integration.email}</p>
                    )}

                    <p className="text-xs text-gray-500">
                        本文から日時を検出しました。内容を確認・修正してから追加してください。メモには元メールへのリンクが入ります。
                    </p>

                    {rows.map(row => (
                        <div key={row.id} className="rounded-lg border border-gray-200 p-3 space-y-2.5">
                            <div className="flex gap-2">
                                <select
                                    value={row.kind}
                                    onChange={e => updateRow(row.id, { kind: e.target.value as ScheduleKind })}
                                    className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                                    disabled={row.status === 'done'}
                                >
                                    <option value="event">予定</option>
                                    <option value="todo">ToDo</option>
                                </select>
                                <input
                                    value={row.title}
                                    onChange={e => updateRow(row.id, { title: e.target.value })}
                                    placeholder="タイトル"
                                    className={inputClass}
                                    disabled={row.status === 'done'}
                                />
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <label className="flex items-center gap-1.5 text-sm text-gray-600">
                                    <input
                                        type="checkbox"
                                        checked={row.allDay}
                                        onChange={e => updateRow(row.id, {
                                            allDay: e.target.checked,
                                            start: switchAllDay(row.start, e.target.checked),
                                            end: switchAllDay(row.end, e.target.checked),
                                        })}
                                        disabled={row.status === 'done'}
                                    />
                                    {row.kind === 'event' ? '終日' : '日付のみ'}
                                </label>
                                <span className="text-xs text-gray-500">{row.kind === 'event' ? '開始' : '期限'}</span>
                                <input
                                    type={row.allDay ? 'date' : 'datetime-local'}
                                    value={row.start}
                                    onChange={e => updateRow(row.id, { start: e.target.value })}
                                    className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                                    disabled={row.status === 'done'}
                                />
                                {row.kind === 'event' && (
                                    <>
                                        <span className="text-xs text-gray-500">終了</span>
                                        <input
                                            type={row.allDay ? 'date' : 'datetime-local'}
                                            value={row.end}
                                            onChange={e => updateRow(row.id, { end: e.target.value })}
                                            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                                            disabled={row.status === 'done'}
                                        />
                                    </>
                                )}
                            </div>

                            {row.kind === 'event' && (
                                <input
                                    value={row.location}
                                    onChange={e => updateRow(row.id, { location: e.target.value })}
                                    placeholder="場所 (任意)"
                                    className={inputClass}
                                    disabled={row.status === 'done'}
                                />
                            )}

                            <textarea
                                value={row.notes}
                                onChange={e => updateRow(row.id, { notes: e.target.value })}
                                placeholder="メモ (任意)"
                                rows={2}
                                className={inputClass}
                                disabled={row.status === 'done'}
                            />

                            <div className="flex items-center justify-end gap-3">
                                {row.status === 'done' && row.htmlLink && (
                                    <a href={row.htmlLink} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-600 hover:underline">
                                        Googleで開く
                                    </a>
                                )}
                                {row.status === 'done' ? (
                                    <span className="text-sm text-green-700">追加しました</span>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => setRows(prev => prev.filter(r => r.id !== row.id))}
                                            className="text-sm text-gray-500 hover:text-gray-700 px-2 py-2"
                                            disabled={row.status === 'saving'}
                                        >
                                            除外
                                        </button>
                                        <button
                                            onClick={() => handleRegister(row)}
                                            disabled={!connected || row.status === 'saving'}
                                            className="rounded-md bg-brand-600 px-3 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
                                        >
                                            {row.status === 'saving'
                                                ? '追加中...'
                                                : row.kind === 'event' ? 'カレンダーに追加' : 'ToDoに追加'}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}

                    <button
                        onClick={addManualRow}
                        className="w-full rounded-lg border border-dashed border-gray-300 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
                    >
                        + 手動で追加
                    </button>
                </div>
            </div>
        </div>
    );
}
