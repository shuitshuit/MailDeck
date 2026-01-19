CREATE TABLE public.imap_folders (
	id uuid DEFAULT uuid_generate_v4() NOT NULL,
	user_id varchar(255) NOT NULL,
	config_id uuid NOT NULL,
	display_name varchar(100) NOT NULL,
	imap_path varchar(255) NOT NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT imap_folders_pk PRIMARY KEY (id),
	CONSTRAINT imap_folders_uq_config_path UNIQUE (config_id, imap_path),
	CONSTRAINT imap_folders_users_fk FOREIGN KEY (user_id) REFERENCES public.users(id),
	CONSTRAINT imap_folders_config_fk FOREIGN KEY (config_id) REFERENCES public.user_server_configs(id) ON DELETE CASCADE
);

CREATE INDEX imap_folders_user_id_idx ON public.imap_folders (user_id);
CREATE INDEX imap_folders_config_id_idx ON public.imap_folders (config_id);
