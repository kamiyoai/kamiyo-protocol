use std::env;
use std::ffi::OsString;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::{self, Command, ExitCode};
use std::time::{SystemTime, UNIX_EPOCH};

const BUNDLE: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/assets/reality-fork-cli.mjs"
));

struct TempBundle {
    path: PathBuf,
}

impl TempBundle {
    fn create() -> io::Result<Self> {
        let path = temp_bundle_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, BUNDLE.as_bytes())?;
        set_executable(&path)?;
        Ok(Self { path })
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempBundle {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

fn temp_bundle_path() -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or_default();

    env::temp_dir()
        .join("kamiyo-reality-fork-cli")
        .join(format!("bundle-{}-{stamp}.mjs", process::id()))
}

#[cfg(unix)]
fn set_executable(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = fs::metadata(path)?.permissions();
    permissions.set_mode(0o700);
    fs::set_permissions(path, permissions)
}

#[cfg(not(unix))]
fn set_executable(_path: &Path) -> io::Result<()> {
    Ok(())
}

fn node_binary() -> OsString {
    env::var_os("KAMIYO_REALITY_FORK_NODE").unwrap_or_else(|| OsString::from("node"))
}

fn main() -> ExitCode {
    match run() {
        Ok(code) => ExitCode::from(code),
        Err(error) => {
            eprintln!("{error}");
            ExitCode::from(1)
        }
    }
}

fn run() -> Result<u8, String> {
    let bundle = TempBundle::create()
        .map_err(|error| format!("failed to prepare bundled CLI: {error}"))?;

    let status = Command::new(node_binary())
        .arg(bundle.path())
        .args(env::args_os().skip(1))
        .stdin(process::Stdio::inherit())
        .stdout(process::Stdio::inherit())
        .stderr(process::Stdio::inherit())
        .status()
        .map_err(|error| {
            if error.kind() == io::ErrorKind::NotFound {
                "failed to launch node; install Node.js 20+ or set KAMIYO_REALITY_FORK_NODE".to_string()
            } else {
                format!("failed to launch bundled CLI: {error}")
            }
        })?;

    Ok(status.code().unwrap_or(1) as u8)
}
