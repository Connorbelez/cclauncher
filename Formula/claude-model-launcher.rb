class ClaudeModelLauncher < Formula
  desc "TUI for managing Claude Code model configurations"
  homepage "https://github.com/connor/cclauncher"
  url "https://registry.npmjs.org/claude-model-launcher/-/claude-model-launcher-1.0.0.tgz"
  sha256 "a5df7d61c8b2b5ee69151fd9e18694fe3c0bce8ab2c6dcc3a6c3f362b7082951"
  license "Apache-2.0"

  depends_on "oven-sh/bun/bun"

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"dist/cli.js" => "claude-launch"
  end

  test do
    assert_match "CCLauncher", shell_output("#{bin}/claude-launch --version")
  end
end
