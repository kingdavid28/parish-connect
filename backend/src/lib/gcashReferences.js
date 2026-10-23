async function claimGcashReference(client, reference, sourceType, sourceId) {
  try {
    await client.query(
      `INSERT INTO gcash_reference_claims (gcash_ref, source_type, source_id)
       VALUES ($1, $2, $3)`,
      [String(reference).trim().toUpperCase(), sourceType, sourceId]
    );
    return true;
  } catch (error) {
    if (String(error.code) === "23505") return false;
    throw error;
  }
}

async function releaseGcashReference(client, sourceType, sourceId) {
  await client.query(
    "DELETE FROM gcash_reference_claims WHERE source_type = $1 AND source_id = $2",
    [sourceType, sourceId]
  );
}

module.exports = { claimGcashReference, releaseGcashReference };
