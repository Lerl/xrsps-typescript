import { QueueTask, TaskGenerator, createTask } from "./QueueTask";
import { TaskPriority } from "./TaskPriority";

type MenuAwareContext = {
    hasMenuOpen?: () => boolean;
};

/**
 * Manages a set of queue tasks for a pawn.
 * RSMod parity: gg.rsmod.game.model.queue.QueueTaskSet
 */
export class QueueTaskSet<TContext = unknown> {
    private tasks: QueueTask<TContext>[] = [];
    private readonly ctx: TContext;

    constructor(ctx: TContext) {
        this.ctx = ctx;
    }

    /**
     * Queue a new task.
     */
    queue(priority: TaskPriority, generatorFn: TaskGenerator<TContext>): QueueTask<TContext> {
        if (priority === TaskPriority.STRONG) {
            this.terminateWeakTasks();
        }

        const task = createTask(this.ctx, priority, generatorFn);
        // Insertion order: tasks queued first are processed first within a cycle
        this.tasks.push(task);
        return task;
    }

    /**
     * Queue a weak task (can be interrupted by player input).
     */
    queueWeak(generatorFn: TaskGenerator<TContext>): QueueTask<TContext> {
        return this.queue(TaskPriority.WEAK, generatorFn);
    }

    /**
     * Queue a standard task.
     */
    queueStandard(generatorFn: TaskGenerator<TContext>): QueueTask<TContext> {
        return this.queue(TaskPriority.STANDARD, generatorFn);
    }

    /**
     * Queue a strong task.
     */
    queueStrong(generatorFn: TaskGenerator<TContext>): QueueTask<TContext> {
        return this.queue(TaskPriority.STRONG, generatorFn);
    }

    /**
     * Process tasks for one game cycle.
     *
     * Every task ticks independently (a suspended task does not block the
     * ones behind it), so concurrent delayed scripts — e.g. several queued
     * hits or a level-up alongside a teleport — all count down each cycle.
     * STANDARD tasks pause while a menu is open; WEAK and STRONG always run.
     */
    cycle(): void {
        if (this.tasks.length === 0) return;

        // Snapshot: tasks queued during processing start on the next cycle
        const snapshot = [...this.tasks];
        for (const task of snapshot) {
            if (task.completed()) continue;

            const ctx = task.ctx as TContext & MenuAwareContext;
            if (task.priority === TaskPriority.STANDARD && ctx.hasMenuOpen?.()) {
                continue;
            }

            if (!task.invoked) {
                task.invoked = true;
                task.invoke();
            }

            task.cycle();
        }

        this.tasks = this.tasks.filter((task) => !task.completed());
    }

    /**
     * Submit a return value (e.g. dialog input) to the task waiting for one.
     */
    submitReturnValue(value: unknown): void {
        const task =
            this.tasks.find((t) => t.awaitingReturnValue) ??
            this.tasks.find((t) => t.suspended());
        if (!task) return;
        task.requestReturnValue = value;
    }

    /**
     * Terminate all tasks.
     */
    terminateTasks(): void {
        for (const task of this.tasks) {
            task.terminate();
        }
        this.tasks = [];
    }

    /**
     * Terminate weak tasks only. Standard and strong tasks survive.
     * Called on player input (walk click, new interaction, teleport request)
     * and when a strong task is queued.
     */
    terminateWeakTasks(): void {
        const remaining: QueueTask<TContext>[] = [];
        for (const task of this.tasks) {
            if (task.priority === TaskPriority.WEAK) {
                task.terminate();
            } else {
                remaining.push(task);
            }
        }
        this.tasks = remaining;
    }

    /**
     * Check if any tasks are currently running.
     */
    hasActiveTasks(): boolean {
        return this.tasks.length > 0;
    }

    /**
     * Check if any tasks of the given priority are running.
     */
    hasTasksOfPriority(priority: TaskPriority): boolean {
        return this.tasks.some((task) => task.priority === priority);
    }

    /**
     * Get the number of active tasks.
     */
    get size(): number {
        return this.tasks.length;
    }

    /**
     * Check if any task is currently suspended (waiting).
     */
    hasSuspendedTasks(): boolean {
        return this.tasks.some((task) => task.suspended());
    }
}
