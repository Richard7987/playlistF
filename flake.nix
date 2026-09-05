{
  description = "playlistF — la playlist Fa hecha web (snapshot de Navidrome + Astro)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        node = pkgs.nodejs_22;
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [ node pkgs.gh ];
          shellHook = ''
            echo "playlistF · node $(node --version)"
            [ -f .env ] || echo "· falta .env — copia .env.example para 'npm run pull'"
          '';
        };

        # nix run .#pull  — genera el snapshot desde Navidrome
        apps.pull = {
          type = "app";
          program = toString (pkgs.writeShellScript "playlistf-pull" ''
            cd ${self}
            exec ${node}/bin/node --env-file=.env scripts/pull.mjs "$@"
          '');
        };
      });
}
