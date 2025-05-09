import { BaseComponent, Components } from "@flamework/components";
import { OnInit, OnTick } from "@flamework/core";
import { Constructor } from "@flamework/core/out/utility";
import { Client, Entity as _Entity, QuarrelEvents, EntityBase, Entity } from "@quarrelgame-framework/common";
import { Events, Functions } from "network";

export class Rollback implements OnTick, OnInit
{
    public readonly TIME_TO_REFRESH_SEC = 1000 * 60;
    public readonly TIME_TO_PURGE_SEC = 1000 * 60 * 2;

    static {
    }

    constructor(protected readonly components: Components, private entityConstructor: Constructor<Entity>)
    {}

    private registeredEntities: Map<Entity, DateTime> = new Map();
    private entitiesToPurge: Set<Entity> = new Set();

    onInit()
    {
        assert(this.TIME_TO_PURGE_SEC > this.TIME_TO_REFRESH_SEC, `time to purge (${this.TIME_TO_PURGE_SEC}) cannot be less than time to refresh (${this.TIME_TO_REFRESH_SEC}); time to purge is meant to reduce memory consumption`);

        Events.SyncEntities.connect((entityModels) =>
        {
            for (const [entityModel, entityComponentId] of entityModels)
            {
                if (!entityComponentId)

                    warn(`entity component id for entity ${entityModel} not found`);

                if (this.components.getComponent(entityModel, entityComponentId))

                    continue;



                let entity: Entity;
                let entityTracker: RBXScriptConnection | void = entityModel.DescendantAdded.Connect(() =>
                { 

                    pcall(() => entity = this.components.addComponent(entityModel, entityComponentId));
                });


                this.components.waitForComponent(entityModel, entityComponentId).then(() =>
                {
                    entityTracker = entityTracker!.Disconnect();
                    this.registeredEntities.set(entity, DateTime.now());
                })
            }


            warn("Registered entities upon load-in:", this.registeredEntities);

        })

        Events.EntityRegistered.connect((entityId, entityModel, entityComponentId) =>
        {
            print("Entity registered:", entityModel, `(id ${entityId})`);
            if (!this.components.getComponent(entityModel, entityComponentId))
            {
                let entity: Entity;
                let entityTracker: RBXScriptConnection | void = entityModel.DescendantAdded.Connect(() =>
                { 

                    pcall(() => entity = this.components.addComponent(entityModel, entityComponentId));
                });


                this.components.waitForComponent(entityModel, entityComponentId).then(() =>
                {
                    if (entity.attributes.EntityId !== entityId)
                    
                        entity.attributes.EntityId = entityId;

                    entityTracker = entityTracker!.Disconnect();
                })
            }
        })

        Events.EntityUnregistered.connect((entityId) =>
        {
            // i am a horrible human being
            print(`Entity unregistered: ${entityId})`);
            if (this.registeredEntities.delete(([...this.registeredEntities].find(([e]) => e.attributes.EntityId === entityId))?.[0] ?? "" as never))

                return true

            else
            {
                const foundEntity = [...this.entitiesToPurge].find((e) => e.attributes.EntityId === entityId)
                if (!foundEntity)

                    return;
                
                this.components.removeComponent<Entity>(foundEntity.instance);
                this.entitiesToPurge.delete(foundEntity)
                /*
                 * FIXME: make Networking.EntityIsRegistered
                 * take an array of entities to reduce 
                 * server load
                 */

            }
        })
    }

    onStart()
    {
        Events.Joined.fire();
    }

    public recordedPurgeTime: number = 0;
    onTick(dt: number)
    {
        for (const [entity, timeRegistered] of this.registeredEntities)
        {
            if ((DateTime.now().UnixTimestampMillis - timeRegistered.UnixTimestampMillis) >= this.TIME_TO_REFRESH_SEC)
            {
                if (!this.entitiesToPurge.has(entity))

                    this.entitiesToPurge.add(entity);

            }
        }

        if (this.recordedPurgeTime >= this.TIME_TO_PURGE_SEC)
        {
            for (const entity of this.entitiesToPurge)

                this.components.removeComponent<Entity>(entity.instance);

            this.recordedPurgeTime = 0;
        } else this.recordedPurgeTime += dt;   
    }
}

export default Rollback;
