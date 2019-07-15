import { addSession, removeSession, getAllSession } from './sessionManager';
import { sessionDBPath } from '../../config';
import { existsSync, unlinkSync } from 'fs';
import { generateRandomName } from '../utils';
import { PomodoroRecord } from './index';

describe('sessionManager', () => {
    beforeAll(() => {
        if (existsSync(sessionDBPath)) {
            unlinkSync(sessionDBPath);
        }
    });

    it('addSession', async () => {
        const record: PomodoroRecord = {
            projectId: generateRandomName(),
            startTime: new Date().getTime(),
            apps: {},
            switchTimes: 0,
            screenStaticDuration: 0,
            spentTimeInHour: 0,
            todoId: generateRandomName()
        };

        await addSession(record);
        const sessions = await getAllSession();
        const ans = sessions.find(v => v.projectId === record.projectId);
        expect(ans).toBeTruthy();
        if (ans) {
            expect(ans.todoId).toBe(record.todoId);
        }
    });

    it('removeSession', async () => {
        const record: PomodoroRecord = {
            projectId: generateRandomName(),
            startTime: new Date().getTime(),
            apps: {},
            switchTimes: 0,
            screenStaticDuration: 0,
            spentTimeInHour: 0,
            todoId: generateRandomName()
        };

        await addSession(record);
        await removeSession(record.startTime);
        const sessions = await getAllSession();
        const ans = sessions.find(v => v.projectId === record.projectId);
        expect(ans).toBeUndefined();
    });
});