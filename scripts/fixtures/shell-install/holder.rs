//! A real Windows image/handle holder for the installer qualification fixture.
use std::io::{self, Write};
use std::os::windows::fs::OpenOptionsExt;
use std::time::Duration;

fn main() {
    let args: Vec<_> = std::env::args_os().collect();
    let millis: u64 = args[1].to_str().unwrap().parse().unwrap();
    let _file = args.get(2).map(|path| {
        std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .custom_flags(if args.get(3).is_some_and(|arg| arg == "link") {
                0x00200000 // FILE_FLAG_OPEN_REPARSE_POINT: hold the link, not its target.
            } else {
                0
            })
            .open(path)
            .unwrap()
    });
    println!("ready");
    io::stdout().flush().unwrap();
    std::thread::sleep(Duration::from_millis(millis));
}
