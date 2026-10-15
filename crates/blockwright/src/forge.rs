//! Forge installer resolution. Shared lifecycle and runtime storage stay in engine/.
use crate::{
    config::{LoaderEngine, NeoForgeConfig},
    neoforge::{NeoForgeRuntimeRequirements, ResolvedNeoForgeVersions},
};
use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
const BASE: &str = "https://maven.minecraftforge.net/net/minecraftforge/forge";
pub async fn resolve_versions(config: &NeoForgeConfig) -> Result<ResolvedNeoForgeVersions> {
    anyhow::ensure!(
        config.minecraft_version != "latest",
        "Forge requires an explicit minecraft_version"
    );
    let loader_version = if config.loader_version == "latest" {
        let metadata = crate::http::get_bytes(&format!("{BASE}/maven-metadata.xml")).await?;
        latest_for_minecraft(&String::from_utf8(metadata)?, &config.minecraft_version)?
    } else {
        config.loader_version.clone()
    };
    Ok(ResolvedNeoForgeVersions {
        engine: LoaderEngine::Forge,
        minecraft_version: config.minecraft_version.clone(),
        loader_version,
    })
}
fn latest_for_minecraft(metadata: &str, minecraft: &str) -> Result<String> {
    let prefix = format!("{minecraft}-");
    crate::neoforge::parse_maven_versions(metadata)
        .into_iter()
        .filter_map(|version| version.strip_prefix(&prefix).map(str::to_string))
        .max_by_key(|version| {
            version
                .split('.')
                .map(|part| part.parse::<u64>().unwrap_or(0))
                .collect::<Vec<_>>()
        })
        .with_context(|| format!("No Forge release for Minecraft {minecraft}"))
}
pub async fn ensure_installer(
    store: &Path,
    versions: &ResolvedNeoForgeVersions,
) -> Result<PathBuf> {
    let version = versions.artifact_version();
    let path = store
        .join("forge/installer")
        .join(&version)
        .join(format!("forge-{version}-installer.jar"));
    if !path.exists() {
        crate::http::download(
            &format!("{BASE}/{version}/forge-{version}-installer.jar"),
            &path,
        )
        .await?;
    }
    Ok(path)
}
pub fn runtime_requirements(
    config: &NeoForgeConfig,
    versions: &ResolvedNeoForgeVersions,
) -> NeoForgeRuntimeRequirements {
    let mut r = crate::neoforge::runtime_requirements(config, versions);
    r.managed_agent_loader = "[52.0.28,)".to_string();
    r
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selects_only_the_exact_minecraft_release() {
        let xml="<version>1.21.1-52.0.29</version><version>1.21.3-53.0.0</version><version>1.21.1-52.0.9</version><version>1.21.1-52.0.28</version>";
        assert_eq!(latest_for_minecraft(xml, "1.21.1").unwrap(), "52.0.29");
        assert!(latest_for_minecraft(xml, "1.20.1").is_err());
    }
    #[test]
    fn forge_artifact_and_client_names_are_not_neoforge_names() {
        let v = ResolvedNeoForgeVersions {
            engine: LoaderEngine::Forge,
            minecraft_version: "1.21.1".into(),
            loader_version: "52.0.28".into(),
        };
        assert_eq!(v.artifact_version(), "1.21.1-52.0.28");
        assert_eq!(v.client_version_id(), "1.21.1-forge-52.0.28");
    }
}
