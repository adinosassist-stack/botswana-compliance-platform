#!/usr/bin/env python3
"""Unpack *already verified* immutable manager Worker/assets without rebuilding."""
import argparse
import hashlib
import io
import pathlib
import shutil
import tarfile
import zipfile

WORKER_SHA = "9a9496e2481a03db0c9f1dcaccc89a450d5048f1bad3523ab6454b240a0bc75e"
PUBLIC_TAR_SHA = "a2a6099c465a3605227ae77858bbd9d475e9fda7bc3e751fc4f1a3b947a660dc"
EXPECTED_CONFIG_SHA = "7d3c5a36912df19409ab168f18c67df7b55f4755"
EXPECTED_DB = "518a9e33-b2ba-4204-ac52-aae4150a7b52"
EXPECTED_NAME = "bw-manager-invitations-functional-private-staging"

def sha256(data):
    return hashlib.sha256(data).hexdigest()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--worker",type=pathlib.Path,required=True)
    parser.add_argument("--assets",type=pathlib.Path,required=True)
    parser.add_argument("--target",type=pathlib.Path,required=True)
    a=parser.parse_args()
    assert not a.target.exists(), "target must not exist before extracting"
    cfg=pathlib.Path("cloudflare/wrangler.manager-invitations-functional-staging.toml")
    content=cfg.read_bytes()
    # Git blob hash protects the configuration against unreviewed source drift.
    blob=b"blob "+str(len(content)).encode()+b"\0"+content
    assert hashlib.sha1(blob).hexdigest()==EXPECTED_CONFIG_SHA, "reviewed Wrangler config changed"
    import tomllib
    config=tomllib.loads(content.decode())
    assert config["name"]==EXPECTED_NAME
    assert config["main"]=="src/worker.js"
    assert config["workers_dev"] is False and config["preview_urls"] is False
    assert config["d1_databases"]==[{"binding":"DB","database_name":"bw-manager-invitations-synthetic-staging","database_id":EXPECTED_DB}]
    assert config["assets"]["directory"]=="../public" and config["assets"]["binding"]=="ASSETS"
    assert not config.get("routes") and not config.get("triggers")
    flags=["MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED","MANAGER_INVITATIONS_SCHEMA_READY","MANAGER_INVITATIONS_ACCESS_READY","MANAGER_ACCESS_REQUESTS_ENABLED","MANAGER_ACCESS_PROVISIONING_ENABLED"]
    assert all(config["vars"][k]=="false" for k in flags)
    assert config["vars"]["PUBLIC_ORIGIN"]=="" and config["vars"]["PUBLIC_APP_URL"]==""
    with zipfile.ZipFile(a.worker) as z:
        worker=z.read("worker.js")
    assert sha256(worker)==WORKER_SHA
    with zipfile.ZipFile(a.assets) as z:
        tarbytes=z.read("public.tar")
    assert sha256(tarbytes)==PUBLIC_TAR_SHA
    worker_path=a.target/"cloudflare"/"src"/"worker.js"
    worker_path.parent.mkdir(parents=True)
    worker_path.write_bytes(worker)
    assert sha256(worker_path.read_bytes())==WORKER_SHA
    target_cfg=a.target/"cloudflare"/"wrangler.manager-invitations-functional-staging.toml"
    shutil.copyfile(cfg,target_cfg)
    public=a.target/"public"
    public.mkdir()
    with tarfile.open(fileobj=io.BytesIO(tarbytes),mode="r:") as tf:
        files=[m for m in tf.getmembers() if m.isfile()]
        assert len(files)==278
        assert all(m.isfile() or m.isdir() for m in tf.getmembers())
        for m in files:
            path=pathlib.PurePosixPath(m.name)
            assert not path.is_absolute() and ".." not in path.parts and "\\" not in m.name
            dest=public.joinpath(*path.parts)
            dest.parent.mkdir(parents=True,exist_ok=True)
            dest.write_bytes(tf.extractfile(m).read())
    assert sum(x.is_file() for x in public.rglob("*"))==278
    print("Exact Worker, 278 static assets, reviewed fail-closed Wrangler config staged; NO CLOUDFLARE WRITES")

if __name__=="__main__":
    main()
