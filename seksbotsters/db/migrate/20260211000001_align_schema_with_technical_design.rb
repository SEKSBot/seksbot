class AlignSchemaWithTechnicalDesign < ActiveRecord::Migration[7.0]
  def change
    # Users: add verification detail fields from technical design
    add_column :users, :human_verification_method, :string  # 'manual', 'oauth', 'captcha'
    add_column :users, :verified_at, :datetime
    add_column :users, :verified_by_user_id, :integer

    add_index :users, :verified_by_user_id

    # Injection flags: add resolution workflow fields
    add_column :injection_flags, :status, :string, default: 'pending', null: false
    add_column :injection_flags, :resolved_by_id, :integer
    add_column :injection_flags, :resolved_at, :datetime

    add_index :injection_flags, :status
    add_index :injection_flags, :resolved_by_id

    # Stories/comments: add injection_hidden (design uses this instead of injection_confirmed)
    add_column :stories, :injection_hidden, :boolean, default: false, null: false
    add_column :stories, :injection_auto_flagged, :boolean, default: false, null: false
    add_column :comments, :injection_hidden, :boolean, default: false, null: false
    add_column :comments, :injection_auto_flagged, :boolean, default: false, null: false

    add_index :stories, :injection_hidden
    add_index :comments, :injection_hidden
  end
end
