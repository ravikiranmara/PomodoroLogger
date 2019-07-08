import {createActionCreator, createReducer} from 'deox';
import {cloneDeep, find} from 'lodash'
import dbs from '../../dbs'
import { Dispatch } from 'redux';
import { TodoItem, createTodoItem } from '../TODO/action';


export interface SubAppSpentTime {
    title: string;
    spentHours: number;
}


export interface ApplicationSpentTime{
    title: string;
    spentHours: number;
    subAppSpentTime: SubAppSpentTime[];
    keywords: string[];
}


export interface ProjectItem {
    name: string,
    todoList: TodoItem[],
    spentHours: number,
    applicationSpentTime: {[appName: string]: ApplicationSpentTime},

}

const defaultProjectItem: ProjectItem = {
    name: '',
    todoList: [],
    spentHours: 0,
    applicationSpentTime: {}
};


type ProjectMap = {[name: string]: ProjectItem};

export interface ProjectState {
    projectList: ProjectMap
}


const defaultState: ProjectState = {
    projectList: {},
};


export const addItem = createActionCreator('[Project]ADD_ITEM', resolve=>
    (name: string)=>(
        resolve({name})
    )
);

export const removeItem = createActionCreator('[Project]REMOVE_ITEM', resolve=>
    (name: string) => resolve({name})
);

export const addTodoItem = createActionCreator('[Project]ADD_TODO_ITEM', resolve =>
    (name: string, todoItem: TodoItem) => resolve({name, todoItem})
);

export const setName = createActionCreator('[Project]SET_NAME', resolve=>(
    (name: string, newName: string) => resolve({name, newName})
));

export const updateAppSpentTime = createActionCreator('[Project]UPDATE_APP_SPENT_TIME', resolve=>(
    (name: string, appName: string, spentHours: number) => resolve({name, appName, spentHours})
));

export const fetchAll = createActionCreator('[Project]FETCH_ALL', resolve=>(
    (projects: ProjectItem[]) => resolve(projects)
));


export const actions = {
    fetchAll: ()=>(dispatch: Dispatch) => {
        dbs.projectDB.find({}, {}, (err, items)=>{
            const newProjectList: ProjectItem[] = items as ProjectItem[];
            return dispatch(fetchAll(newProjectList));
        });
    },
    removeItem: (name: string) => (dispatch: Dispatch) => {
        dbs.projectDB.remove({name}, err=>{
            if (err) throw err;
            dispatch(removeItem(name));
        })
    },
    setName:
        (name: string, newName: string)=>(dispatch: Dispatch)=>{
            dbs.projectDB.update({name}, {$set: {name: newName}},{}, (err)=>{
                if (err) {
                    throw err;
                }

                dispatch(setName(name, newName));
            })
        },
    addItem: (name: string)=> (dispatch: Dispatch)=>{
        // @ts-ignore
        const data: ProjectItem = {...defaultProjectItem, name};
        dbs.projectDB.insert(data, (err, newDoc: typeof data & {name: string})=>{
            if (err) {
                throw err;
            }

            dispatch(addItem(newDoc.name));
        });
    },

    addTodoItem: (name: string, title: string) => (dispatch: Dispatch) => {
        const todoItem: TodoItem = createTodoItem(title);
        dbs.projectDB.update({name},
            {$push: {todoList: todoItem}}, {}, (err)=>{
                if(err) throw err;
                dispatch(addTodoItem(name, todoItem));
            })
    },

    updateAppSpentTime: (name: string, appName: string, spentHours: number) =>
        (dispatch: Dispatch) => {
            dbs.projectDB.update(
                {name},
                {$set: {[`applicationSpentTime.${appName}.spentHours`]: spentHours}},
                {upsert: true},
                err => {
                    if (err) throw err;
                    dispatch(updateAppSpentTime(name, appName, spentHours))
                }
            );
        },
};

export type ActionCreatorTypes = {[key in keyof typeof actions]: typeof actions[key]};


// ==================================
//
//            Reducer
//
// ==================================


export const projectReducer = createReducer<ProjectState, any>(defaultState, handle=>[
    handle(addItem, (state: ProjectState, {payload: {name}})=>{
        const newState = cloneDeep(state);
        const data = {
            ...defaultProjectItem,
            name,
        };
        newState.projectList[name] = data;
        return newState;
    }),

    handle(setName, (state: ProjectState, {payload: {name, newName}})=>{
        const newState = cloneDeep(state);
        newState.projectList[newName] = newState.projectList[name];
        delete newState.projectList[name];
        return newState;
    }),

    handle(removeItem, (state: ProjectState, {payload: {name}})=>{
        const newState = cloneDeep(state);
        delete newState.projectList[name];
        return newState;
    }),

    handle(fetchAll, (state: ProjectState, {payload})=>{
        const projects: ProjectItem[] = payload;
        const newProjectMap: ProjectMap = {};
        for (const project of projects) {
            newProjectMap[project.name] = project;
        }

        return {...state, projectList: newProjectMap}
    }),

    handle(addTodoItem, (state: ProjectState, {payload: {name, todoItem}})=>{
        const newState = cloneDeep(state);
        newState.projectList[name].todoList.push(todoItem);
        return newState;
    }),

    handle(updateAppSpentTime, (
        state: ProjectState,
        {payload: {name, appName, spentHours}}
        )=>{
        const newState = cloneDeep(state);
        newState.projectList[name].applicationSpentTime[appName].spentHours = spentHours;
        return newState;
    })

]);

