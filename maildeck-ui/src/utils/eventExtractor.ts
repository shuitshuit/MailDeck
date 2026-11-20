import * as chrono from 'chrono-node';

/**
 * メール本文から予定 / TODO の候補をルールベースで抜き出す。
 * 日付の解釈は chrono-node (ja + en) に任せ、苦手な部分 (来週◯曜, 重複検出, 締切の判定,
 * 場所の抽出, 引用部分の除外) をここで補う。結果はあくまで候補で、登録前にユーザーが編集する。
 */

export type ScheduleKind = 'event' | 'todo';

export interface ScheduleCandidate {
    id: string;
    kind: ScheduleKind;
    title: string;
    start: Date;
    end?: Date;
    allDay: boolean;
    location?: string;
    /** 検出元の行 (UIで根拠として表示する) */
    sourceText: string;
}

export interface ExtractInput {
    subject: string;
    bodyText: string;
    /** 「明日」「来週」の基準。メールの受信日時を渡す */
    referenceDate: Date;
}

const MAX_CANDIDATES = 10;

/** これがあれば TODO (締切) とみなす */
const STRONG_TODO = /締切|締め切り|〆切|〆切り|期限|期日|提出|納期|deadline|due\b/i;
/** 時刻がないときに限り TODO とみなす (「15時まで」は予定の終了時刻のことが多い) */
const WEAK_TODO = /まで(に)?|by\s/i;

const LOCATION_LINE = /^[\s・*\-■●◆]*(?:場所|会場|開催場所|開催地|集合場所|Location|Venue|Where|Place)\s*[:：]\s*(.+)$/im;
const ONLINE_MEETING_URL = /https?:\/\/(?:[\w-]+\.)?(?:zoom\.us\/j|meet\.google\.com|teams\.microsoft\.com\/l\/meetup-join|teams\.live\.com\/meet|[\w-]+\.webex\.com\/(?:meet|join))[^\s<>"）)]*/i;

/** 返信の引用ヘッダー行など、過去の日付しか出てこない行 */
const QUOTE_HEADER = /wrote:|書きました|送信日時|^\s*(?:sent|date|日付|送信)\s*[:：]/i;

const WEEK_PREFIX = /(今週|来週|再来週)(?:の)?\s*$/;
const WEEK_OFFSET: Record<string, number> = { 今週: 0, 来週: 1, 再来週: 2 };

const SUBJECT_PREFIX = /^\s*(?:(?:re|fwd?|fw|aw|tr)\s*[:：]\s*|【[^】]*】\s*)+/i;

export function cleanSubject(subject: string): string {
    return subject.replace(SUBJECT_PREFIX, '').trim() || subject.trim();
}

export function extractScheduleCandidates({ subject, bodyText, referenceDate }: ExtractInput): ScheduleCandidate[] {
    const title = cleanSubject(subject) || '(無題)';
    const text = stripQuotedLines(`${subject}\n${bodyText}`);
    const location = findLocation(bodyText);

    const options = { forwardDate: true };
    const results = [
        ...chrono.ja.parse(text, referenceDate, options),
        ...chrono.en.parse(text, referenceDate, options),
    ].sort((a, b) => a.index - b.index || b.text.length - a.text.length);

    const candidates: ScheduleCandidate[] = [];
    let lastEnd = -1;

    for (const r of results) {
        // ja と en が同じ箇所を拾うので、重なったら先 (長い方) を採用
        if (r.index < lastEnd) continue;
        if (!r.start.isCertain('day') && !r.start.isCertain('weekday')) continue; // 「10時」だけ等は除外
        lastEnd = r.index + r.text.length;

        let start = r.start.date();
        let end = r.end?.date();

        const weekShift = resolveWeekPrefix(text, r.index, start, referenceDate);
        if (weekShift !== 0) {
            start = addDays(start, weekShift);
            if (end) end = addDays(end, weekShift);
        }

        const hasTime = r.start.isCertain('hour');
        const line = lineAround(text, r.index, r.text.length);
        const kind: ScheduleKind =
            STRONG_TODO.test(line) || (!hasTime && WEAK_TODO.test(line.slice(line.indexOf(r.text) + r.text.length)))
                ? 'todo'
                : 'event';

        candidates.push({
            id: `${r.index}-${start.getTime()}`,
            kind,
            title,
            start,
            end: end && end > start ? end : undefined,
            allDay: !hasTime,
            location: kind === 'event' ? location : undefined,
            sourceText: line.trim(),
        });
    }

    return dedupe(candidates).slice(0, MAX_CANDIDATES);
}

/** 候補が見つからないときの手動入力用の雛形 (受信日の翌日・終日) */
export function blankCandidate(subject: string, referenceDate: Date, kind: ScheduleKind = 'event'): ScheduleCandidate {
    const start = new Date(referenceDate);
    start.setHours(0, 0, 0, 0);
    return {
        id: `manual-${Date.now()}`,
        kind,
        title: cleanSubject(subject) || '(無題)',
        start: addDays(start, 1),
        allDay: true,
        sourceText: '',
    };
}

function stripQuotedLines(text: string): string {
    // 行を消すと index がずれるので、同じ長さの空白に置き換える
    return text
        .split('\n')
        .map(line => (/^\s*>/.test(line) || QUOTE_HEADER.test(line) ? ' '.repeat(line.length) : line))
        .join('\n');
}

function findLocation(body: string): string | undefined {
    const m = body.match(LOCATION_LINE);
    if (m) {
        const value = m[1].trim();
        if (value) return value.slice(0, 200);
    }
    return body.match(ONLINE_MEETING_URL)?.[0];
}

/**
 * chrono-node は「来週水曜日」の「来週」を読まず、直近の水曜として返す。
 * 直前に 今週/来週/再来週 があれば、基準日の週 (月曜始まり) から数え直したずれ (日数) を返す。
 */
function resolveWeekPrefix(text: string, index: number, parsed: Date, ref: Date): number {
    const m = text.slice(Math.max(0, index - 6), index).match(WEEK_PREFIX);
    if (!m) return 0;

    const monday = startOfWeekMonday(ref);
    const weekdayFromMonday = (parsed.getDay() + 6) % 7;
    const target = addDays(monday, WEEK_OFFSET[m[1]] * 7 + weekdayFromMonday);

    const parsedDay = new Date(parsed);
    parsedDay.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - parsedDay.getTime()) / 86_400_000);
}

function startOfWeekMonday(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return addDays(d, -((d.getDay() + 6) % 7));
}

function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function lineAround(text: string, index: number, length: number): string {
    const lineStart = text.lastIndexOf('\n', index) + 1;
    const nl = text.indexOf('\n', index + length);
    return text.slice(lineStart, nl === -1 ? undefined : nl).slice(0, 200);
}

function dedupe(candidates: ScheduleCandidate[]): ScheduleCandidate[] {
    const seen = new Set<string>();
    return candidates.filter(c => {
        const key = `${c.kind}|${c.allDay ? c.start.toDateString() : c.start.getTime()}|${c.end?.getTime() ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** <input type="datetime-local"> 用 "yyyy-MM-ddTHH:mm" */
export function toLocalDateTimeInput(date: Date): string {
    return `${toDateInput(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** <input type="date"> 用 "yyyy-MM-dd" */
export function toDateInput(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(n: number): string {
    return String(n).padStart(2, '0');
}
