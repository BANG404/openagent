//! Kernel-enforced lifetime for the long-lived children of the desktop host.
//!
//! The host owns two children for the whole life of the process: the supervised
//! Runtime and the Cua Driver daemon. Both have to disappear with the host on
//! *every* exit path, including the ones where no Rust `Drop` runs at all — the
//! release profile sets `panic = "abort"`, and a force-kill, a crash, or a
//! logoff never unwinds either.
//!
//! On Windows the guarantee is a Job Object per child with
//! `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`: the job handle lives in this process, so
//! the kernel closes it — and terminates every member — the moment the host dies
//! for any reason. The guard returned here holds that handle and closes it when
//! dropped during an orderly shutdown.
//!
//! Unix has no equivalent, so the same invariant comes from the control pipe
//! each child already watches: the Runtime treats control-stdin EOF as loss of
//! its desktop owner, and the Cua Driver daemon does the same through
//! `--parent-liveness-stdio`. The guard is therefore a no-op there and the pipe
//! is the contract of record.

#[cfg(windows)]
pub(crate) struct HostLifetimeGuard(windows::Win32::Foundation::HANDLE);

#[cfg(windows)]
unsafe impl Send for HostLifetimeGuard {}

#[cfg(windows)]
unsafe impl Sync for HostLifetimeGuard {}

#[cfg(windows)]
impl Drop for HostLifetimeGuard {
    fn drop(&mut self) {
        let _ = unsafe { windows::Win32::Foundation::CloseHandle(self.0) };
    }
}

/// Bound to the host by a control pipe rather than by a kernel job.
#[cfg(not(windows))]
pub(crate) struct HostLifetimeGuard;

#[cfg(windows)]
fn create_lifetime_job(label: &str) -> Result<HostLifetimeGuard, String> {
    use windows::Win32::System::JobObjects::{
        CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    let job = unsafe { CreateJobObjectW(None, None) }
        .map(HostLifetimeGuard)
        .map_err(|error| format!("failed to create {label} lifecycle job: {error}"))?;
    let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    unsafe {
        SetInformationJobObject(
            job.0,
            JobObjectExtendedLimitInformation,
            &limits as *const _ as _,
            std::mem::size_of_val(&limits) as u32,
        )
    }
    .map_err(|error| format!("failed to configure {label} lifecycle job: {error}"))?;
    Ok(job)
}

/// Bind a tokio child — the supervised Runtime — to this process.
#[cfg(windows)]
pub(crate) fn bind_tokio_child(
    label: &str,
    child: &tokio::process::Child,
) -> Result<HostLifetimeGuard, String> {
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::JobObjects::AssignProcessToJobObject;

    let job = create_lifetime_job(label)?;
    let process = HANDLE(
        child
            .raw_handle()
            .ok_or_else(|| format!("{label} process handle is unavailable"))?,
    );
    unsafe { AssignProcessToJobObject(job.0, process) }
        .map_err(|error| format!("failed to bind {label} to desktop lifecycle: {error}"))?;
    Ok(job)
}

#[cfg(not(windows))]
pub(crate) fn bind_tokio_child(
    _label: &str,
    _child: &tokio::process::Child,
) -> Result<HostLifetimeGuard, String> {
    Ok(HostLifetimeGuard)
}

/// Bind an already-spawned child — the Cua Driver daemon — to this process.
///
/// A `std::process::Child` owns no waitable handle this module can borrow, so
/// the process is reopened by id. Binding happens right after the spawn, while
/// the child is still alive; a child that exited in between fails here rather
/// than silently losing its guard.
#[cfg(windows)]
pub(crate) fn bind_std_child(
    label: &str,
    child: &std::process::Child,
) -> Result<HostLifetimeGuard, String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::JobObjects::AssignProcessToJobObject;
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE};

    let job = create_lifetime_job(label)?;
    let process = unsafe { OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, child.id()) }
        .map_err(|error| format!("failed to open {label} process handle: {error}"))?;
    let assigned = unsafe { AssignProcessToJobObject(job.0, process) };
    let _ = unsafe { CloseHandle(process) };
    assigned.map_err(|error| format!("failed to bind {label} to desktop lifecycle: {error}"))?;
    Ok(job)
}

#[cfg(not(windows))]
pub(crate) fn bind_std_child(
    _label: &str,
    _child: &std::process::Child,
) -> Result<HostLifetimeGuard, String> {
    Ok(HostLifetimeGuard)
}
