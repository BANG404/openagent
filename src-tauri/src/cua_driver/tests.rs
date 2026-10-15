/// The owner lock is what tells a live peer's daemon apart from one whose
/// owner is gone, so it has to disappear with the process that holds it.
#[test]
fn cua_driver_ownership_is_exclusive_per_process_and_released_on_drop() {
    use std::fs::TryLockError;

    let path = std::env::temp_dir().join(format!(
        "openagent-cua-owner-test-{}/daemon.lock",
        uuid::Uuid::new_v4()
    ));
    std::fs::create_dir_all(path.parent().expect("owner lock parent"))
        .expect("create owner lock directory");

    let owner = std::fs::OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .open(&path)
        .expect("open owner lock");
    owner.try_lock().expect("first lock succeeds");

    // A second handle stands in for the next OpenAgent process.
    let contender = std::fs::OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .open(&path)
        .expect("open owner lock again");
    assert!(matches!(
        contender.try_lock(),
        Err(TryLockError::WouldBlock)
    ));

    drop(owner);
    contender
        .try_lock()
        .expect("the lock is free once its owner is gone");

    drop(contender);
    std::fs::remove_dir_all(path.parent().expect("owner lock parent"))
        .expect("remove owner lock fixture");
}
