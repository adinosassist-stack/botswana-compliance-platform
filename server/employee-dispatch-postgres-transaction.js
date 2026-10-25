/**
 * PostgreSQL transaction boundary for future employee dispatch persistence.
 * This does not implement proposal/review authorization, outbox tables or execution.
 * The supplied callback must implement all admission operations using this client.
 * No migrations, workers or feature switches are performed here.
 */
export function createEmployeeDispatchPostgresTransactionStore(pool, makeTransaction) {
  if (!pool || typeof pool.connect !== "function" || typeof makeTransaction !== "function") {
    throw new TypeError("invalid_dispatch_store_dependencies");
  }
  return {
    async transaction(callback) {
      if (typeof callback !== "function") throw new TypeError("invalid_transaction_callback");
      const client = await pool.connect();
      let begun = false;
      try {
        await client.query("BEGIN");
        begun = true;
        // An unimplemented adapter must never be interpreted as an authorized store.
        const tx = await makeTransaction(client);
        if (!tx || typeof tx !== "object") throw new Error("invalid_dispatch_transaction_adapter");
        const result = await callback(tx);
        await client.query("COMMIT");
        begun = false;
        return result;
      } catch (error) {
        if (begun) {
          try { await client.query("ROLLBACK"); } catch { /* Preserve original failure. */ }
        }
        throw error;
      } finally {
        client.release();
      }
    }
  };
}
