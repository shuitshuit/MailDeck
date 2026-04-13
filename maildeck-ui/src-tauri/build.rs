fn main() {
  tauri_build::try_build(
    tauri_build::Attributes::new().plugin(
      "fcm",
      tauri_build::InlinedPlugin::new()
        .commands(&["getFcmToken"])
        .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
    ),
  )
  .expect("failed to run tauri-build");
}
