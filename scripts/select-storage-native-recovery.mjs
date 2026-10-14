// @ts-check
import assert from "node:assert/strict";
import { Database } from "bun:sqlite";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

/** Select a synthetic live recovery point after Runtime startup recovery.
 * @param {string | undefined} fixtureHome
 */
export function selectStorageNativeRecovery(fixtureHome) {
  const home = resolve(fixtureHome || "");
  assert(home.startsWith(resolve(tmpdir()) + "/") || home.startsWith(resolve(tmpdir()) + "\\"));
  assert(home.includes("trace-export-storage"), "select the synthetic storage fixture");
  const db = new Database(join(home, "messages.db"));
  try {
    db.exec("PRAGMA busy_timeout = 30000");
    assert.equal(db.query("PRAGMA user_version").get()?.user_version, 11);
    assert.equal(
      db.query("SELECT title FROM conversations WHERE id = 'native-storage-history'").get()?.title,
      "Native storage branches",
    );
    db.transaction(() => {
      // Branch A is older than sibling B, making incorrect newest selection
      // observable. References remain a complete snapshot of synthetic A.
      db.exec(`
        INSERT OR REPLACE INTO checkpoints
          (thread_id,checkpoint_id,parent_checkpoint_id,metadata,checkpoint,created_at)
        SELECT thread_id,'native-live-recovery',checkpoint_id,'{}',
          json_set(checkpoint,'$.phase','before_completion'),3
        FROM checkpoints WHERE checkpoint_id='native-tip-a';
        DELETE FROM checkpoint_messages WHERE checkpoint_id='native-live-recovery';
        INSERT INTO checkpoint_messages(checkpoint_id,ordinal,version_id)
        SELECT 'native-live-recovery',ordinal,version_id FROM checkpoint_messages
        WHERE checkpoint_id='native-tip-a';
        UPDATE conversations SET active_tip_checkpoint_id='native-live-recovery'
        WHERE id='native-storage-history';
        UPDATE branches SET head_checkpoint_id='native-live-recovery'
        WHERE id='native-branch-a' AND conv_id='native-storage-history';
      `);
    })();
  } finally {
    db.close();
  }
}
